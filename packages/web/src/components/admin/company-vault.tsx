'use client';

import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ChevronDown, KeyRound, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { CompanyMember } from '@/lib/api-client/endpoints-companies';
import { request } from '@/lib/api-client/request';
import { ApiError } from '@/lib/query-client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

type Vault = {
  items: { id: string; name: string; origin: string; has_totp: boolean }[];
  grants: { item_id: string; user_id: string; password: boolean; totp: boolean }[];
};

export function CompanyVault({
  companyId,
  members,
}: { companyId: string; members: CompanyMember[] }) {
  const client = useQueryClient();
  const path = `/v1/company-vault/${encodeURIComponent(companyId)}`;
  const queryKey = ['company-vault', companyId];
  const vault = useQuery({ queryKey, queryFn: () => request<Vault>(path), retry: false });
  const [hasKey, setHasKey] = useState(false);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const needle = search.trim().toLowerCase();
  const items =
    vault.data?.items.filter((item) =>
      `${item.name} ${item.origin}`.toLowerCase().includes(needle),
    ) ?? [];
  const activeMembers = members.filter((member) => member.status === 'active');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const fail = (text: string) => {
    setFailed(true);
    setMessage(text);
  };
  async function save(body: object) {
    setBusy(true);
    setFailed(false);
    setMessage('');
    try {
      await request(path, { method: 'POST', body });
      await client.invalidateQueries({ queryKey });
      setMessage('Alteração salva.');
      return true;
    } catch (error) {
      const status = error instanceof ApiError ? error.status : undefined;
      const code =
        error instanceof ApiError ? (error.problem as { code?: string } | null)?.code : undefined;
      const messages: Record<string, string> = {
        vault_invalid_origin: 'Informe um endereço HTTPS válido, sem usuário ou senha no endereço.',
        vault_invalid_totp:
          'Use a chave Base32 do autenticador. O código de seis dígitos não é a chave.',
        vault_invalid_members:
          'Algum membro selecionado não tem mais vínculo ativo. Atualize a página e selecione novamente.',
        vault_invalid_input: 'Confira o nome, o usuário e a senha da credencial.',
      };
      fail(
        (code && messages[code]) ||
          (status === 403
            ? 'Sua conta não tem permissão para alterar o Cofre desta empresa.'
            : 'Não foi possível salvar. Confira sua conexão e tente novamente.'),
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="vault-title"
      className="glass-card space-y-5 rounded-xl border border-border bg-card p-4 sm:p-6"
    >
      <Dialog
        open={creating}
        onOpenChange={(open) => {
          if (!busy) {
            setMessage('');
            setHasKey(false);
            setCreating(open);
          }
        }}
      >
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="rounded-lg border border-border bg-bg-elevated p-2.5">
              <KeyRound className="size-5" aria-hidden />
            </span>
            <div>
              <h2 id="vault-title" className="text-xl font-semibold">
                Cofre de senhas
              </h2>
              <p className="text-sm text-muted-foreground">
                Logins compartilhados e permissões de senha e 2FA.
              </p>
            </div>
          </div>
          {vault.data && (
            <DialogTrigger asChild>
              <Button type="button">
                <Plus className="size-4" aria-hidden /> Novo login
              </Button>
            </DialogTrigger>
          )}
        </header>
        {vault.isPending && <p>Carregando cofre…</p>}
        {vault.isError && <p role="status">Cofre indisponível.</p>}
        {message && !creating && (
          <p role="status" className="rounded-lg border border-border px-3 py-2 text-sm">
            {message}
          </p>
        )}
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl">
          <DialogTitle>Novo login</DialogTitle>
          <DialogDescription>Cadastre a credencial e escolha quem terá acesso.</DialogDescription>
          <form
            className="grid gap-3 [&_label]:grid [&_label]:gap-1.5 [&_label]:text-sm"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const data = new FormData(form);
              const key = String(data.get('key'))
                .toUpperCase()
                .replace(/\s+/g, '')
                .replace(/=+$/, '');
              const address = String(data.get('origin')).trim();
              const url = URL.canParse(address) ? new URL(address) : null;
              if (!url || url.protocol !== 'https:' || url.username || url.password) {
                fail('Informe o endereço completo do site, começando com https://.');
                (form.elements.namedItem('origin') as HTMLInputElement).focus();
                return;
              }
              if (key && (!/^[A-Z2-7]{16,128}$/.test(key) || [1, 3, 6].includes(key.length % 8))) {
                fail('Use a chave Base32 do autenticador. O código de seis dígitos não é a chave.');
                (form.elements.namedItem('key') as HTMLInputElement).focus();
                return;
              }
              const saved = await save({
                type: 'create',
                initialGrants: activeMembers
                  .map((member) => ({
                    userId: member.user_id,
                    password: data.has(`password:${member.user_id}`),
                    totp: Boolean(key) && data.has(`totp:${member.user_id}`),
                  }))
                  .filter((entry) => entry.password || entry.totp),
                credential: {
                  name: data.get('name'),
                  origin: url.origin,
                  username: data.get('username'),
                  password: data.get('password'),
                  ...(key && { totpSecret: key }),
                },
              });
              if (saved) {
                form.reset();
                setSearch('');
                setHasKey(false);
                setCreating(false);
              }
            }}
          >
            <label>
              Nome{' '}
              <Input name="name" required maxLength={120} placeholder="Ex.: Conta de tráfego" />
            </label>
            <label>
              Endereço do site
              <Input
                name="origin"
                required
                inputMode="url"
                maxLength={2048}
                placeholder="https://exemplo.com/login"
              />
              <small className="text-muted-foreground">
                Você pode colar o link completo da página de login.
              </small>
            </label>
            <label>
              Usuário ou e-mail <Input name="username" required maxLength={250} />
            </label>
            <label>
              Senha{' '}
              <Input
                name="password"
                required
                type="password"
                autoComplete="new-password"
                maxLength={512}
              />
            </label>
            <label>
              Chave 2FA Base32 (opcional){' '}
              <Input
                name="key"
                type="password"
                autoComplete="off"
                maxLength={160}
                onChange={(event) => setHasKey(Boolean(event.target.value.trim()))}
              />
            </label>
            <fieldset
              disabled={busy}
              className="min-w-0 space-y-2 rounded-lg border border-border px-3 pb-2"
            >
              <legend className="px-1 text-sm font-medium">Membros com acesso</legend>
              <div className="max-h-44 divide-y divide-border overflow-y-auto">
                {activeMembers.map((member) => (
                  <fieldset
                    key={member.user_id}
                    className="flex min-w-0 flex-wrap items-center gap-4 py-2"
                  >
                    <legend className="sr-only">{member.name}</legend>
                    <span aria-hidden className="min-w-24 flex-1 break-words text-sm font-medium">
                      {member.name}
                    </span>
                    <label className="!flex items-center">
                      <input type="checkbox" name={`password:${member.user_id}`} /> Senha
                    </label>
                    <label className="!flex items-center">
                      <input type="checkbox" name={`totp:${member.user_id}`} disabled={!hasKey} />{' '}
                      2FA
                    </label>
                  </fieldset>
                ))}
              </div>
              {!hasKey && (
                <p className="text-xs text-muted-foreground">
                  Informe a chave 2FA para liberar códigos.
                </p>
              )}
            </fieldset>
            {message && (
              <p
                role={failed ? 'alert' : 'status'}
                className="rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm"
              >
                {message}
              </p>
            )}
            <Button type="submit" disabled={busy}>
              {busy ? 'Salvando…' : 'Cadastrar login'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      {vault.data && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <h3 className="text-sm font-semibold">
              Credenciais{' '}
              <span className="ml-1 text-muted-foreground">{vault.data.items.length}</span>
            </h3>
            <div className="relative w-full sm:max-w-xs">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                type="search"
                aria-label="Buscar credenciais"
                placeholder="Buscar por nome ou site"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="pl-9"
              />
            </div>
          </div>
          {!items.length && (
            <p className="rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground">
              {needle
                ? 'Nenhuma credencial corresponde à busca.'
                : 'Nenhum login cadastrado. Use Novo login para adicionar o primeiro.'}
            </p>
          )}
          <div className="grid gap-3 lg:grid-cols-2">
            {items.map((item) => (
              <article
                key={item.id}
                className="min-w-0 self-start overflow-hidden rounded-xl border border-border bg-bg-elevated"
              >
                <div className="flex items-start justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <h4 className="break-words font-semibold">{item.name}</h4>
                    <p className="break-all text-sm text-muted-foreground">{item.origin}</p>
                  </div>
                  <Badge variant="outline" className="shrink-0">
                    {item.has_totp ? '2FA ativo' : 'Sem 2FA'}
                  </Badge>
                </div>
                <details className="group border-t border-border">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-medium focus-visible:outline focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                    Permissões por membro
                    <ChevronDown className="size-4 group-open:rotate-180" aria-hidden />
                  </summary>
                  <div className="divide-y divide-border px-4 pb-2">
                    {activeMembers.map((member) => {
                      const current = vault.data.grants.find(
                        (g) => g.item_id === item.id && g.user_id === member.user_id,
                      );
                      const update = (password: boolean, totp: boolean) =>
                        save({
                          type: 'grant',
                          grant: { itemId: item.id, userId: member.user_id, password, totp },
                        });
                      return (
                        <fieldset
                          key={member.user_id}
                          className="flex flex-wrap gap-4 py-3 text-sm"
                          disabled={busy}
                        >
                          <legend className="sr-only">{member.name}</legend>
                          <span className="min-w-24 flex-1 break-words font-medium" aria-hidden>
                            {member.name}
                          </span>
                          <label className="flex items-center gap-2 whitespace-nowrap">
                            <input
                              type="checkbox"
                              checked={Boolean(current?.password)}
                              onChange={(event) =>
                                void update(event.target.checked, Boolean(current?.totp))
                              }
                            />{' '}
                            Senha
                          </label>
                          <label className="flex items-center gap-2 whitespace-nowrap">
                            <input
                              type="checkbox"
                              checked={Boolean(current?.totp)}
                              disabled={!item.has_totp}
                              onChange={(event) =>
                                void update(Boolean(current?.password), event.target.checked)
                              }
                            />{' '}
                            2FA
                          </label>
                        </fieldset>
                      );
                    })}
                  </div>
                </details>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
