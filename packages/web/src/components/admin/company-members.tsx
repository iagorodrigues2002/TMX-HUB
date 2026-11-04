'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiClient } from '@/lib/api-client';
import { type Company, type MemberAccess, companyApi } from '@/lib/api-client/endpoints-companies';
import { useAuth } from '@/lib/auth-context';
import { ALL_TOOL_KEYS } from '@page-cloner/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { CompanyMemberAccess, roleLabels } from './company-member-access';

function CompanyTeam({ company, userId }: { company: Company; userId: string }) {
  const client = useQueryClient();
  const { user, refresh: refreshAuth } = useAuth();
  const membersHeading = useRef<HTMLHeadingElement>(null);
  const canManage = company.role === 'owner' || company.role === 'admin';
  const members = useQuery({
    queryKey: ['company-members', userId, company.id],
    queryFn: () => companyApi.members(company.id),
    enabled: canManage,
  });
  const offers = useQuery({
    queryKey: ['company-offers', userId, company.id],
    queryFn: () => companyApi.offers(company.id),
  });
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function refresh() {
    await client.invalidateQueries({ queryKey: ['company-members', userId, company.id] });
  }
  async function save(id: string, access: MemberAccess) {
    await companyApi.save(company.id, id, access);
    await refresh();
    await client.invalidateQueries({ queryKey: ['companies', userId] });
    setMessage('Permissões salvas no servidor.');
  }
  async function savePlatformRole(id: string, role: 'admin' | 'user') {
    if (user?.role !== 'admin')
      throw new Error('Somente administradores globais podem alterar este acesso.');
    await apiClient.updateUser(id, { role });
    await Promise.all([
      client.invalidateQueries({ queryKey: ['company-members'] }),
      client.invalidateQueries({ queryKey: ['users-list'] }),
      client.invalidateQueries({ queryKey: ['admin-overview'] }),
    ]);
    if (id === userId) await refreshAuth();
    setMessage('Acesso global atualizado. O vínculo e a função na empresa foram preservados.');
    membersHeading.current?.focus();
  }
  if (!canManage)
    return (
      <section className="glass-card rounded-xl border border-border bg-card p-6">
        <h2 className="text-xl font-semibold">Sua empresa: {company.name}</h2>
        <p className="mt-2 text-muted-foreground">
          Você é colaborador. Somente proprietários e administradores desta empresa podem gerenciar
          membros e permissões.
        </p>
      </section>
    );
  return (
    <div className="space-y-5">
      <form
        className="glass-card rounded-xl border border-border bg-card p-5"
        onSubmit={(event) => {
          event.preventDefault();
          void (async () => {
            setPending(true);
            setError('');
            setMessage('');
            try {
              await companyApi.add(company.id, email.trim());
              setEmail('');
              await refresh();
              setMessage(
                'Colaborador vinculado sem acesso a ofertas ou ferramentas. Configure as permissões.',
              );
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : 'Não foi possível vincular.');
            } finally {
              setPending(false);
            }
          })();
        }}
      >
        <h2 className="text-lg font-semibold">Vincular colaborador</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Use o e-mail de uma conta já cadastrada no TMX. Não envia convite nem concede acesso
          global.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label htmlFor="company-member-email" className="min-w-0 flex-1 text-sm">
            E-mail
            <Input
              id="company-member-email"
              className="mt-2"
              type="email"
              required
              value={email}
              maxLength={254}
              onChange={(event) => setEmail(event.target.value)}
              disabled={pending}
            />
          </label>
          <Button type="submit" disabled={pending}>
            {pending ? 'Vinculando…' : 'Vincular pessoa'}
          </Button>
        </div>
      </form>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {message && <output className="text-primary">{message}</output>}
      <h2
        ref={membersHeading}
        tabIndex={-1}
        className="text-lg font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Membros de {company.name}
      </h2>
      {members.isPending && <output>Carregando membros…</output>}
      {(members.isError || offers.isError) && (
        <div role="alert" className="glass-card rounded-xl border border-destructive/40 p-5">
          <p>
            Não foi possível consultar os membros ou as ofertas. Nenhuma permissão foi alterada.
          </p>
          <Button
            variant="outline"
            onClick={() => {
              void members.refetch();
              void offers.refetch();
            }}
          >
            Tentar novamente
          </Button>
        </div>
      )}
      {!members.isError &&
        !offers.isError &&
        members.data?.members.map((member) => (
          <CompanyMemberAccess
            key={`${company.id}:${member.user_id}:${JSON.stringify(member)}`}
            member={member}
            offers={offers.data?.offers ?? []}
            isOwner={company.role === 'owner'}
            canEdit={!offers.isPending && (company.role === 'owner' || member.role === 'member')}
            save={save}
            savePlatformRole={user?.role === 'admin' ? savePlatformRole : undefined}
          />
        ))}
    </div>
  );
}

export function CompanyMembers() {
  const { user, loading } = useAuth();
  const client = useQueryClient();
  const companies = useQuery({
    queryKey: ['companies', user?.id],
    queryFn: companyApi.list,
    enabled: !!user,
  });
  const [selected, setSelected] = useState('');
  const [name, setName] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const company =
    companies.data?.companies.find((item) => item.id === selected) ?? companies.data?.companies[0];
  if (loading || companies.isPending) return <output>Carregando empresas…</output>;
  if (!user) return <p role="alert">Entre na sua conta para continuar.</p>;
  const canCreateCompany =
    user.role === 'admin' ||
    user.allowedTools === undefined ||
    ALL_TOOL_KEYS.filter((tool) => !tool.startsWith('nav:')).every((tool) =>
      user.allowedTools?.includes(tool),
    );
  return (
    <div className="mx-auto max-w-6xl space-y-6 text-foreground">
      <header>
        <h1 className="text-2xl font-semibold">Empresa e membros</h1>
        <p className="mt-2 text-muted-foreground">
          Vínculos e permissões gravados no servidor, separados por empresa.
        </p>
      </header>
      {companies.isError ? (
        <div role="alert">
          <p>Não foi possível carregar suas empresas.</p>
          <Button onClick={() => void companies.refetch()}>Tentar novamente</Button>
        </div>
      ) : (
        <>
          {company && (
            <>
              <label className="block max-w-lg text-sm">
                Empresa
                <select
                  className="mt-2 block w-full rounded-lg border border-input bg-bg-elevated p-3"
                  value={company.id}
                  onChange={(event) => setSelected(event.target.value)}
                >
                  {companies.data?.companies.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} · {roleLabels[item.role]}
                    </option>
                  ))}
                </select>
              </label>
              <CompanyTeam key={company.id} company={company} userId={user.id} />
            </>
          )}
          {!company && !canCreateCompany && (
            <p className="rounded-xl border border-border bg-card p-6">
              Sua conta não tem vínculo empresarial ativo. Peça ao administrador da sua empresa para
              adicioná-la.
            </p>
          )}
          {!company && canCreateCompany && (
            <form
              className="glass-card space-y-4 rounded-xl border border-border bg-card p-6"
              onSubmit={(event) => {
                event.preventDefault();
                void (async () => {
                  setPending(true);
                  setError('');
                  try {
                    await companyApi.create(name.trim());
                    await client.invalidateQueries({ queryKey: ['companies', user.id] });
                    setName('');
                  } catch (cause) {
                    setError(
                      cause instanceof Error ? cause.message : 'Não foi possível criar a empresa.',
                    );
                  } finally {
                    setPending(false);
                  }
                })();
              }}
            >
              <h2 className="text-lg font-semibold">Crie sua empresa</h2>
              <p className="text-sm text-muted-foreground">
                Não encontramos vínculo empresarial ativo para esta conta. A criação não transfere
                automaticamente ofertas de outras contas.
              </p>
              <label htmlFor="company-name" className="block text-sm">
                Nome da empresa
                <Input
                  id="company-name"
                  className="mt-2"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  minLength={2}
                  maxLength={120}
                  required
                  disabled={pending}
                />
              </label>
              {error && (
                <p role="alert" className="text-destructive">
                  {error}
                </p>
              )}
              <Button type="submit" disabled={pending}>
                {pending ? 'Criando…' : 'Criar empresa'}
              </Button>
            </form>
          )}
        </>
      )}
    </div>
  );
}
