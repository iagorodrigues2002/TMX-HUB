'use client';

import { Button } from '@/components/ui/button';
import type { CompanyMember, MemberAccess } from '@/lib/api-client/endpoints-companies';
import React, { useId, useState } from 'react';
import { CompanyMemberPlatformRole } from './company-member-platform-role';
import { CompanyNavigationAccess } from './company-navigation-access';

export const roleLabels = {
  owner: 'Proprietário',
  admin: 'Administrador da empresa',
  member: 'Colaborador',
};
export function CompanyMemberAccess({
  member,
  offers,
  canEdit,
  isOwner,
  save,
  savePlatformRole,
}: {
  member: CompanyMember;
  offers: { id: string; name: string }[];
  canEdit: boolean;
  isOwner: boolean;
  save: (userId: string, access: MemberAccess) => Promise<void>;
  savePlatformRole?: (userId: string, role: 'admin' | 'user') => Promise<void>;
}) {
  const panelId = useId();
  const [editing, setEditing] = useState(false);
  const [access, setAccess] = useState<MemberAccess>({
    role: member.role,
    status: member.status,
    tools: member.tools,
    all_offers: member.all_offers,
    offer_ids: member.offer_ids,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const toggle = (key: 'tools' | 'offer_ids', value: string) =>
    setAccess((current) => ({
      ...current,
      [key]: current[key].includes(value)
        ? current[key].filter((item) => item !== value)
        : [...current[key], value],
    }));
  return (
    <article className="glass-card rounded-xl border border-border bg-card p-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">{member.name}</h3>
          <p className="text-sm text-muted-foreground break-all">
            {member.email ?? 'Usuário indisponível'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span>
            Na empresa: {roleLabels[member.role]} ·{' '}
            {member.status === 'active' ? 'Ativo' : 'Suspenso'}
          </span>
          {canEdit && (
            <Button
              variant="outline"
              aria-expanded={editing}
              aria-controls={panelId}
              onClick={() => {
                setEditing(!editing);
                setError('');
              }}
            >
              {editing ? 'Fechar' : 'Permissões'}
            </Button>
          )}
        </div>
      </header>
      <CompanyMemberPlatformRole member={member} save={savePlatformRole} />
      {editing && (
        <form
          id={panelId}
          aria-label={`Permissões de ${member.name}`}
          className="mt-5 space-y-5 border-t border-border pt-5 motion-safe:animate-[tmx-tracking-section-in_220ms_cubic-bezier(0.22,1,0.36,1)_both]"
          onSubmit={(event) => {
            event.preventDefault();
            void (async () => {
              setSaving(true);
              setError('');
              try {
                await save(member.user_id, access);
                setEditing(false);
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : 'Não foi possível salvar.');
              } finally {
                setSaving(false);
              }
            })();
          }}
        >
          <fieldset disabled={saving} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm">
                Função nesta empresa
                <select
                  className="block min-h-11 w-full rounded-lg border border-input bg-bg-elevated p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                  value={access.role}
                  disabled={!isOwner}
                  onChange={(event) =>
                    setAccess({ ...access, role: event.target.value as MemberAccess['role'] })
                  }
                >
                  <option value="member">Colaborador</option>
                  <option value="admin">Administrador da empresa</option>
                  <option value="owner">Proprietário</option>
                </select>
              </label>
              <label className="space-y-2 text-sm">
                Estado
                <select
                  className="block min-h-11 w-full rounded-lg border border-input bg-bg-elevated p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={access.status}
                  onChange={(event) =>
                    setAccess({ ...access, status: event.target.value as MemberAccess['status'] })
                  }
                >
                  <option value="active">Ativo</option>
                  <option value="suspended">Suspenso</option>
                </select>
              </label>
            </div>
            <CompanyNavigationAccess
              tools={access.tools}
              disabled={access.role !== 'member'}
              onChange={(tools) => setAccess((current) => ({ ...current, tools }))}
            />
            <fieldset>
              <legend className="mb-2 font-medium">Ofertas autorizadas</legend>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:bg-accent/40 focus-within:ring-2 focus-within:ring-ring has-[:checked]:border-primary/40 has-[:checked]:bg-primary/10">
                <input
                  type="checkbox"
                  className="h-4 w-4 shrink-0 accent-primary"
                  checked={access.all_offers}
                  onChange={(event) => setAccess({ ...access, all_offers: event.target.checked })}
                />
                Todas as ofertas desta empresa
              </label>
              {!access.all_offers && (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {offers.length ? (
                    offers.map((offer) => (
                      <label
                        key={offer.id}
                        className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:bg-accent/40 focus-within:ring-2 focus-within:ring-ring has-[:checked]:border-primary/40 has-[:checked]:bg-primary/10"
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 shrink-0 accent-primary"
                          checked={access.offer_ids.includes(offer.id)}
                          onChange={() => toggle('offer_ids', offer.id)}
                        />
                        <span className="min-w-0 break-words">{offer.name}</span>
                      </label>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Nenhuma oferta vinculada a esta empresa. Nenhuma oferta será liberada.
                    </p>
                  )}
                </div>
              )}
            </fieldset>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar permissões'}
            </Button>
          </fieldset>
        </form>
      )}
    </article>
  );
}
