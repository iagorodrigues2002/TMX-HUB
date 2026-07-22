'use client';

import { Checkbox } from '@/components/ui/checkbox';
import type { AuthUser } from '@/lib/api-client';
import { Users } from 'lucide-react';

interface Props {
  members: AuthUser[];
  selected: string[];
  onChange: (memberIds: string[]) => void;
  loading?: boolean;
}

export function OfferMemberPicker({ members, selected, onChange, loading }: Props) {
  const eligible = members.filter((member) => member.role === 'user');

  return (
    <section className="space-y-3 rounded-md border border-white/[0.08] bg-white/[0.02] p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-cyan-300/[0.08] text-cyan-300">
          <Users className="h-4 w-4" />
        </span>
        <div>
          <p className="hud-label">Acesso dos membros</p>
          <p className="mt-1 text-[11px] text-white/45">
            Selecione quais usuários já cadastrados poderão visualizar esta oferta, seus anúncios e
            métricas.
          </p>
        </div>
      </div>

      {loading ? (
        <p className="text-[12px] text-white/45">Carregando membros…</p>
      ) : eligible.length === 0 ? (
        <p className="rounded-md border border-white/[0.06] p-3 text-[12px] text-white/45">
          Nenhum membro disponível. Cadastre usuários em Administração para liberá-los aqui.
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {eligible.map((member) => {
            const checked = selected.includes(member.id);
            return (
              <label
                key={member.id}
                className="flex cursor-pointer items-center gap-3 rounded-md border border-white/[0.06] bg-black/10 px-3 py-3 hover:border-cyan-300/20"
              >
                <Checkbox
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
                  <span className="block truncate text-[13px] font-medium text-white/80">
                    {member.name}
                  </span>
                  <span className="block truncate text-[11px] text-white/40">{member.email}</span>
                </span>
              </label>
            );
          })}
        </div>
      )}

      <p className="text-[10px] uppercase tracking-[0.13em] text-white/35">
        {selected.length === 0
          ? 'Somente administradores e o responsável pela oferta'
          : `${selected.length} membro(s) com acesso`}
      </p>
    </section>
  );
}
