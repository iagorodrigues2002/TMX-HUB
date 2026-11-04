'use client';

import { Button } from '@/components/ui/button';
import type { CompanyMember } from '@/lib/api-client/endpoints-companies';
import { Crown } from 'lucide-react';
import React, { useId, useState } from 'react';

export function CompanyMemberPlatformRole({
  member,
  save,
}: {
  member: CompanyMember;
  save?: (userId: string, role: 'admin' | 'user') => Promise<void>;
}) {
  const panelId = useId();
  const [editing, setEditing] = useState(false);
  const [role, setRole] = useState(member.platform_role);
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const known = member.platform_role === 'admin' || member.platform_role === 'user';
  const changed = known && role !== member.platform_role;
  return (
    <section className="glass-card mt-4 space-y-3 rounded-lg border border-border bg-bg-elevated p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Papel na plataforma</p>
          <p className="flex items-center gap-2 text-sm font-medium">
            {member.platform_role === 'admin' && (
              <Crown className="h-4 w-4 text-primary" aria-hidden />
            )}
            {!known
              ? 'Papel global indisponível'
              : member.platform_role === 'admin'
                ? 'Administrador global'
                : 'Sem administração global'}
          </p>
        </div>
        {save && known && (
          <Button
            variant="outline"
            aria-label={`Alterar acesso global de ${member.name}`}
            aria-expanded={editing}
            aria-controls={panelId}
            disabled={saving}
            onClick={() => {
              setEditing(!editing);
              setRole(member.platform_role);
              setConfirmed(false);
              setError('');
            }}
          >
            {editing ? 'Fechar acesso global' : 'Alterar acesso global'}
          </Button>
        )}
      </div>
      {member.platform_role === 'admin' && (
        <p className="text-xs text-muted-foreground">
          Este papel concede poderes globais no TMX, além das permissões desta empresa.
        </p>
      )}
      {editing && save && known && (
        <form
          id={panelId}
          aria-label={`Acesso global de ${member.name}`}
          onSubmit={(event) => {
            event.preventDefault();
            if (!changed || !confirmed || saving || !role) return;
            void (async () => {
              setSaving(true);
              setError('');
              try {
                await save(member.user_id, role);
                setEditing(false);
              } catch (cause) {
                setError(
                  cause instanceof Error
                    ? cause.message
                    : 'Não foi possível alterar o acesso global.',
                );
              } finally {
                setSaving(false);
              }
            })();
          }}
        >
          <fieldset disabled={saving} className="space-y-3">
            <label className="block space-y-2 text-sm">
              Papel na plataforma de {member.name}
              <select
                value={role ?? ''}
                className="block min-h-11 w-full rounded-lg border border-input bg-bg-elevated p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onChange={(event) => {
                  setRole(event.target.value as 'admin' | 'user');
                  setConfirmed(false);
                  setError('');
                }}
              >
                <option value="user">Sem administração global</option>
                <option value="admin">Administrador global</option>
              </select>
            </label>
            <p className="text-sm text-muted-foreground">
              Administrador global pode gerenciar usuários e acessar dados de outras empresas. A
              função e os vínculos desta empresa não serão alterados.
            </p>
            {changed && (
              <label className="flex min-h-11 items-start gap-3 rounded-lg border border-primary/40 bg-primary/10 p-3 text-sm">
                <input
                  type="checkbox"
                  required
                  className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                Confirmo {role === 'admin' ? 'conceder' : 'remover'} a administração global de{' '}
                {member.name}.
              </label>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" disabled={!changed || !confirmed || saving}>
              {saving ? 'Salvando…' : 'Salvar acesso global'}
            </Button>
          </fieldset>
        </form>
      )}
    </section>
  );
}
