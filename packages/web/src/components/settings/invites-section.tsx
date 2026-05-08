'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Loader2, Mail, Plus, Trash2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient, type InviteView } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function inviteUrl(token: string): string {
  if (typeof window === 'undefined') return `/register?invite=${token}`;
  return `${window.location.origin}/register?invite=${token}`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function daysLeft(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

function copyText(text: string, label: string): void {
  navigator.clipboard.writeText(text).then(
    () => toast.success(`${label} copiado.`),
    () => toast.error(`Não consegui copiar ${label}.`),
  );
}

export function InvitesSection() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [days, setDays] = useState(7);

  const { data, isLoading, error } = useQuery<InviteView[]>({
    queryKey: ['invites'],
    queryFn: () => apiClient.listInvites(),
    retry: false,
  });

  const createMut = useMutation({
    mutationFn: () =>
      apiClient.createInvite({
        ...(email.trim() ? { email: email.trim() } : {}),
        ...(name.trim() ? { name: name.trim() } : {}),
        expiresInDays: days,
      }),
    onSuccess: (invite) => {
      qc.invalidateQueries({ queryKey: ['invites'] });
      setShowForm(false);
      setEmail('');
      setName('');
      setDays(7);
      const url = inviteUrl(invite.token);
      copyText(url, 'Link de convite');
      toast.success('Convite criado e link copiado.');
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const revokeMut = useMutation({
    mutationFn: (token: string) => apiClient.revokeInvite(token),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invites'] });
      toast.success('Convite revogado.');
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const invites = data ?? [];

  // Hide section entirely if user is not admin (403 from backend).
  const isForbidden = useMemo(() => {
    const e = error as { status?: number } | null;
    return e?.status === 403;
  }, [error]);

  if (isForbidden) return null;

  return (
    <section className="glass-card space-y-5 p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-cyan-300" />
          <p className="hud-label">Convites</p>
        </div>
        <Button
          size="sm"
          variant={showForm ? 'outline' : 'default'}
          onClick={() => setShowForm((v) => !v)}
        >
          <Plus className="h-3.5 w-3.5" />
          {showForm ? 'Cancelar' : 'Novo convite'}
        </Button>
      </div>

      <p className="text-[12px] text-white/55">
        Gere um link único de registro pra adicionar um membro. O link expira após o
        prazo escolhido e é destruído quando usado.
      </p>

      {showForm && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createMut.mutate();
          }}
          className="space-y-3 rounded-md border border-white/[0.08] bg-white/[0.02] p-4"
        >
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label className="hud-label">Email (opcional)</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="membro@empresa.com"
                disabled={createMut.isPending}
              />
            </div>
            <div className="space-y-1">
              <Label className="hud-label">Nome (opcional)</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nome do membro"
                disabled={createMut.isPending}
              />
            </div>
          </div>
          <div className="flex items-end justify-between gap-3">
            <div className="space-y-1">
              <Label className="hud-label">Validade (dias)</Label>
              <Input
                type="number"
                min={1}
                max={30}
                value={days}
                onChange={(e) => setDays(Math.max(1, Math.min(30, Number(e.target.value) || 7)))}
                className="w-32"
                disabled={createMut.isPending}
              />
            </div>
            <Button type="submit" disabled={createMut.isPending}>
              {createMut.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Mail className="h-3.5 w-3.5" />
              )}
              Gerar link
            </Button>
          </div>
          <p className="text-[10px] text-white/40">
            Email/Nome só pré-preenchem o formulário do convidado — o link funciona pra
            qualquer pessoa que receber.
          </p>
        </form>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center p-6">
          <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
        </div>
      ) : invites.length === 0 ? (
        <p className="rounded-md border border-dashed border-white/[0.08] bg-white/[0.01] p-4 text-center text-[12px] text-white/45">
          Nenhum convite ativo.
        </p>
      ) : (
        <ul className="space-y-2">
          {invites.map((inv) => (
            <InviteRow
              key={inv.token}
              invite={inv}
              onRevoke={() => {
                if (confirm(`Revogar convite ${inv.email || inv.token.slice(0, 8) + '…'}?`)) {
                  revokeMut.mutate(inv.token);
                }
              }}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function InviteRow({
  invite,
  onRevoke,
}: {
  invite: InviteView;
  onRevoke: () => void;
}) {
  const url = inviteUrl(invite.token);
  const remaining = daysLeft(invite.expiresAt);
  const expiringSoon = remaining <= 1;

  return (
    <li className="rounded-md border border-white/[0.06] bg-black/15 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <p className="text-[13px] font-semibold text-white">
              {invite.email || invite.name || 'Convite sem destinatário'}
            </p>
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${
                expiringSoon
                  ? 'border-amber-300/40 bg-amber-300/10 text-amber-200'
                  : 'border-white/[0.10] bg-white/[0.04] text-white/55'
              }`}
            >
              expira em {remaining}d
            </span>
          </div>
          {invite.name && invite.email && (
            <p className="text-[11px] text-white/55">{invite.name}</p>
          )}
          <p className="break-all font-mono text-[11px] text-white/65" title={url}>
            {url}
          </p>
          <p className="text-[10px] text-white/40">
            criado em {formatDate(invite.createdAt)}
            {invite.invitedBy && <> · por {invite.invitedBy}</>}
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          <Button size="sm" variant="outline" onClick={() => copyText(url, 'Link')}>
            <Copy className="h-3 w-3" />
            Copiar
          </Button>
          <Button size="sm" variant="ghost" onClick={onRevoke}>
            <Trash2 className="h-3 w-3" />
            Revogar
          </Button>
        </div>
      </div>
    </li>
  );
}
