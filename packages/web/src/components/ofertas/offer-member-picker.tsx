'use client';

import { Checkbox } from '@/components/ui/checkbox';
import type { AuthUser } from '@/lib/api-client';
import { Users } from 'lucide-react';
import { useId } from 'react';

interface Props {
  members: AuthUser[];
  selected: string[];
  onChange: (memberIds: string[]) => void;
  loading?: boolean;
}

export function OfferMemberPicker({ members, selected, onChange, loading }: Props) {
  const id = useId();
  const eligible = members.filter((member) => member.role === 'user');

  return (
    <section className="space-y-3 rounded-md border border-border bg-muted p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent text-primary">
          <Users className="h-4 w-4" />
        </span>
        <div>
          <p className="hud-label">Acesso dos membros</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Selecione quais usuários já cadastrados poderão visualizar esta oferta, seus anúncios e
            métricas.
          </p>
        </div>
      </div>

      {loading ? (
        <p className="text-[12px] text-muted-foreground">Carregando membros…</p>
      ) : eligible.length === 0 ? (
        <p className="rounded-md border border-border p-3 text-[12px] text-muted-foreground">
          Nenhum membro disponível. Cadastre usuários em Administração para liberá-los aqui.
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {eligible.map((member) => {
            const checked = selected.includes(member.id);
            return (
              <label
                key={member.id}
                htmlFor={`${id}-${member.id}`}
                className="flex cursor-pointer items-center gap-3 rounded-md border border-border bg-accent px-3 py-3 hover:border-border"
              >
                <Checkbox
                  id={`${id}-${member.id}`}
                  checked={checked}
                  onChange={() =>
                    onChange(
                      checked
                        ? selected.filter((id) => id !== member.id)
                        : [...selected, member.id],
                    )
                  }
                />
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-foreground">
                    {member.name}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {member.email}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      )}

      <p className="text-[10px] uppercase tracking-[0.13em] text-muted-foreground">
        {selected.length === 0
          ? 'Somente administradores e o responsável pela oferta'
          : `${selected.length} membro(s) com acesso`}
      </p>
    </section>
  );
}
