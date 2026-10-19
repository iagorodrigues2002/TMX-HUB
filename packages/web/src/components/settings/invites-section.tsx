'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { type InviteView, type ToolKey, apiClient } from '@/lib/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Mail, Plus, UserPlus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { InviteRow } from './invites-section-invite-row';
import {
  type AccessScope,
  CUSTOM_TOOL_OPTIONS,
  SCOPE_LABEL,
  copyText,
  inviteUrl,
  scopeToAllowedTools,
} from './invites-section-support';

export function InvitesSection() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [days, setDays] = useState(7);
  const [scope, setScope] = useState<AccessScope>('full');
  const [customTools, setCustomTools] = useState<ToolKey[]>(['video-shield']);

  const { data, isLoading, error } = useQuery<InviteView[]>({
    queryKey: ['invites'],
    queryFn: () => apiClient.listInvites(),
    retry: false,
  });

  const createMut = useMutation({
    mutationFn: () => {
      const allowedTools = scopeToAllowedTools(scope, customTools);
      return apiClient.createInvite({
        ...(email.trim() ? { email: email.trim() } : {}),
        ...(name.trim() ? { name: name.trim() } : {}),
        expiresInDays: days,
        ...(allowedTools ? { allowedTools } : {}),
      });
    },
    onSuccess: (invite) => {
      void qc.invalidateQueries({ queryKey: ['invites'] });
      setShowForm(false);
      setEmail('');
      setName('');
      setDays(7);
      setScope('full');
      setCustomTools(['video-shield']);
      const url = inviteUrl(invite.token);
      copyText(url, 'Link de convite');
      toast.success('Convite criado e link copiado.');
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const revokeMut = useMutation({
    mutationFn: (token: string) => apiClient.revokeInvite(token),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['invites'] });
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
        Gere um link único de registro pra adicionar um membro. O link expira após o prazo escolhido
        e é destruído quando usado.
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
          <div className="space-y-1">
            <Label className="hud-label">Acesso</Label>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as AccessScope)}
              disabled={createMut.isPending}
              className="h-10 w-full rounded-md border border-white/[0.10] bg-black/30 px-3 text-[13px] text-white focus:border-cyan-300/40 focus:outline-none"
            >
              {(Object.keys(SCOPE_LABEL) as AccessScope[]).map((k) => (
                <option key={k} value={k}>
                  {SCOPE_LABEL[k]}
                </option>
              ))}
            </select>
            {scope === 'video-shield' && (
              <p className="text-[10px] text-cyan-300/65">
                Membro verá e usará Video Shield + Creative Studio. O restante do hub fica oculto.
              </p>
            )}
            {scope === 'custom' && (
              <div className="mt-2 rounded-md border border-white/[0.06] bg-black/15 p-3">
                <p className="mb-2 text-[10px] uppercase tracking-[0.14em] text-white/45">
                  Selecione as ferramentas liberadas
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {CUSTOM_TOOL_OPTIONS.map((t) => {
                    const checked = customTools.includes(t.key);
                    return (
                      <label
                        key={t.key}
                        className="flex items-center gap-1.5 rounded px-1.5 py-1 text-[12px] text-white/80 hover:bg-white/[0.04]"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setCustomTools((prev) => {
                              if (e.target.checked) {
                                return Array.from(
                                  new Set([
                                    ...prev,
                                    t.key,
                                    ...(t.key === 'ofertas-ia' ? ['ofertas' as const] : []),
                                  ]),
                                );
                              }
                              return prev.filter(
                                (key) =>
                                  key !== t.key && !(t.key === 'ofertas' && key === 'ofertas-ia'),
                              );
                            });
                          }}
                          disabled={createMut.isPending}
                        />
                        {t.label}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
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
            Email/Nome só pré-preenchem o formulário do convidado — o link funciona pra qualquer
            pessoa que receber. Acesso é aplicado ao registrar.
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
                if (confirm(`Revogar convite ${inv.email || `${inv.token.slice(0, 8)}…`}?`)) {
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
