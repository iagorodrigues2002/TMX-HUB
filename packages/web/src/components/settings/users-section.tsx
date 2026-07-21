'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Crown, Loader2, Pencil, Save, Shield, Trash2, Users as UsersIcon, X } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient, type AuthUser, type ToolKey } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';

type AccessScope = 'full' | 'video-shield' | 'custom';

const CUSTOM_TOOL_OPTIONS: { key: ToolKey; label: string }[] = [
  { key: 'video-shield', label: 'Video Studio' },
  { key: 'cloner', label: 'Page Cloner' },
  { key: 'funnel-clone', label: 'Funnel Full Clone' },
  { key: 'upsell-analyzer', label: 'Upsell Analyzer' },
  { key: 'webhook-tester', label: 'Webhook Tester' },
  { key: 'vsl', label: 'VSL Downloader' },
  { key: 'ofertas', label: 'Ofertas' },
  { key: 'logs', label: 'Logs' },
];

const SCOPE_LABEL: Record<AccessScope, string> = {
  full: 'Completo (todas as ferramentas)',
  'video-shield': 'Apenas Video Studio',
  custom: 'Personalizado…',
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function detectScope(user: AuthUser): AccessScope {
  if (user.role === 'admin') return 'full';
  if (!user.allowedTools || user.allowedTools.length === 0) return 'full';
  if (
    user.allowedTools.length === 1 &&
    (user.allowedTools[0] === 'video-shield' || user.allowedTools[0] === 'creative-studio')
  )
    return 'video-shield';
  return 'custom';
}

function scopeToAllowedTools(scope: AccessScope, custom: ToolKey[]): ToolKey[] | null {
  if (scope === 'full') return null;
  if (scope === 'video-shield') return ['video-shield'];
  return custom.length > 0 ? custom : null;
}

export function UsersSection() {
  const qc = useQueryClient();
  const { user: me } = useAuth();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editScope, setEditScope] = useState<AccessScope>('full');
  const [editRole, setEditRole] = useState<'admin' | 'user'>('user');
  const [editCustomTools, setEditCustomTools] = useState<ToolKey[]>([]);

  const { data, isLoading, error } = useQuery<AuthUser[]>({
    queryKey: ['users-list'],
    queryFn: () => apiClient.listUsers(),
    retry: false,
  });

  const updateMut = useMutation({
    mutationFn: async (args: {
      id: string;
      role: 'admin' | 'user';
      allowedTools: ToolKey[] | null;
    }) => {
      return apiClient.updateUser(args.id, {
        role: args.role,
        allowedTools: args.allowedTools,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users-list'] });
      qc.invalidateQueries({ queryKey: ['auth-me'] });
      setEditingId(null);
      toast.success('Acesso atualizado.');
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiClient.deleteUser(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users-list'] });
      toast.success('Usuário removido.');
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const isForbidden = useMemo(() => {
    const e = error as { status?: number } | null;
    return e?.status === 403;
  }, [error]);

  if (isForbidden) return null;

  const users = data ?? [];

  const startEdit = (u: AuthUser) => {
    setEditingId(u.id);
    setEditRole(u.role);
    const scope = detectScope(u);
    setEditScope(scope);
    setEditCustomTools(scope === 'custom' ? (u.allowedTools ?? []) : ['video-shield']);
  };

  const saveEdit = (u: AuthUser) => {
    const finalRole = editRole;
    let allowedTools: ToolKey[] | null;
    if (finalRole === 'admin') {
      allowedTools = null; // admin sempre tudo
    } else {
      allowedTools = scopeToAllowedTools(editScope, editCustomTools);
    }
    updateMut.mutate({ id: u.id, role: finalRole, allowedTools });
  };

  return (
    <section className="glass-card space-y-5 p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <UsersIcon className="h-4 w-4 text-cyan-300" />
          <p className="hud-label">Usuários</p>
        </div>
        <span className="text-[11px] text-white/40">{users.length} cadastrado(s)</span>
      </div>

      <p className="text-[12px] text-white/55">
        Gerencie quem tem acesso ao hub e a quais ferramentas. Admins enxergam tudo; users restritos
        só veem o que estiver liberado.
      </p>

      {isLoading ? (
        <div className="flex items-center justify-center p-6">
          <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
        </div>
      ) : users.length === 0 ? (
        <p className="rounded-md border border-dashed border-white/[0.08] bg-white/[0.01] p-4 text-center text-[12px] text-white/45">
          Nenhum usuário ainda.
        </p>
      ) : (
        <ul className="space-y-2">
          {users.map((u) => {
            const isMe = me?.id === u.id;
            const isEditing = editingId === u.id;
            const currentScope = detectScope(u);
            return (
              <li key={u.id} className="rounded-md border border-white/[0.06] bg-black/15 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[13px] font-semibold text-white">{u.name}</p>
                      {isMe && (
                        <span className="rounded-full border border-white/[0.10] bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/55">
                          você
                        </span>
                      )}
                      {u.role === 'admin' ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/30 bg-amber-300/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-200">
                          <Crown className="h-3 w-3" />
                          admin
                        </span>
                      ) : (
                        <span className="rounded-full border border-white/[0.10] bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/55">
                          user
                        </span>
                      )}
                      {!isEditing && u.role === 'user' && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-200">
                          <Shield className="h-3 w-3" />
                          {currentScope === 'full'
                            ? 'acesso completo'
                            : currentScope === 'video-shield'
                              ? 'apenas video studio'
                              : `${u.allowedTools?.length ?? 0} tools`}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-white/55">{u.email}</p>
                    <p className="text-[10px] text-white/40">
                      registrado em {formatDate(u.createdAt)}
                    </p>
                  </div>
                  {!isEditing && (
                    <div className="flex shrink-0 flex-col gap-1">
                      <Button size="sm" variant="outline" onClick={() => startEdit(u)}>
                        <Pencil className="h-3 w-3" />
                        Editar acesso
                      </Button>
                      {!isMe && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            if (confirm(`Remover o usuário ${u.email}? Isso é irreversível.`))
                              deleteMut.mutate(u.id);
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                          Remover
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                {isEditing && (
                  <div className="mt-3 space-y-3 rounded-md border border-cyan-300/20 bg-cyan-300/[0.03] p-3">
                    {/* Role */}
                    <div>
                      <p className="hud-label mb-1">Papel</p>
                      <div className="flex gap-2">
                        <label className="flex items-center gap-1.5 text-[12px] text-white/80">
                          <input
                            type="radio"
                            name={`role-${u.id}`}
                            checked={editRole === 'user'}
                            onChange={() => setEditRole('user')}
                            disabled={updateMut.isPending}
                          />
                          User
                        </label>
                        <label
                          className={`flex items-center gap-1.5 text-[12px] ${
                            isMe ? 'text-white/40' : 'text-white/80'
                          }`}
                          title={isMe ? 'Você não pode rebaixar a si mesmo' : ''}
                        >
                          <input
                            type="radio"
                            name={`role-${u.id}`}
                            checked={editRole === 'admin'}
                            onChange={() => setEditRole('admin')}
                            disabled={updateMut.isPending}
                          />
                          Admin
                        </label>
                      </div>
                    </div>

                    {/* Scope (só pra user) */}
                    {editRole === 'user' && (
                      <div>
                        <p className="hud-label mb-1">Acesso</p>
                        <select
                          value={editScope}
                          onChange={(e) => setEditScope(e.target.value as AccessScope)}
                          disabled={updateMut.isPending}
                          className="h-9 w-full rounded-md border border-white/[0.10] bg-black/30 px-3 text-[12px] text-white focus:border-cyan-300/40 focus:outline-none"
                        >
                          {(Object.keys(SCOPE_LABEL) as AccessScope[]).map((k) => (
                            <option key={k} value={k}>
                              {SCOPE_LABEL[k]}
                            </option>
                          ))}
                        </select>

                        {editScope === 'custom' && (
                          <div className="mt-2 rounded-md border border-white/[0.06] bg-black/30 p-3">
                            <p className="mb-2 text-[10px] uppercase tracking-[0.14em] text-white/45">
                              Selecione as ferramentas liberadas
                            </p>
                            <div className="grid grid-cols-2 gap-1.5">
                              {CUSTOM_TOOL_OPTIONS.map((t) => {
                                const checked = editCustomTools.includes(t.key);
                                return (
                                  <label
                                    key={t.key}
                                    className="flex items-center gap-1.5 rounded px-1.5 py-1 text-[12px] text-white/80 hover:bg-white/[0.04]"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={(e) => {
                                        setEditCustomTools((prev) =>
                                          e.target.checked
                                            ? Array.from(new Set([...prev, t.key]))
                                            : prev.filter((x) => x !== t.key),
                                        );
                                      }}
                                      disabled={updateMut.isPending}
                                    />
                                    {t.label}
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {editRole === 'admin' && (
                      <p className="text-[11px] text-amber-200/85">
                        Admins têm acesso completo automaticamente — escopo é ignorado.
                      </p>
                    )}

                    <div className="flex justify-end gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingId(null)}
                        disabled={updateMut.isPending}
                      >
                        <X className="h-3 w-3" />
                        Cancelar
                      </Button>
                      <Button size="sm" onClick={() => saveEdit(u)} disabled={updateMut.isPending}>
                        {updateMut.isPending ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Save className="h-3 w-3" />
                        )}
                        Salvar
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
