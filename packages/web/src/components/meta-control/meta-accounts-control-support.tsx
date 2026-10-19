'use client';

import type { MetaControlAccount } from '@/lib/api-client';
import { cn } from '@/lib/utils';

export type Filter = 'all' | 'delivering' | 'idle' | 'disabled' | 'unsettled' | 'attention';

export const statusCopy: Record<MetaControlAccount['operational_state'], string> = {
  delivering: 'Veiculando',
  idle: 'Ativa sem veiculação',
  disabled: 'Desativada',
  unsettled: 'Pendência financeira',
  attention: 'Requer atenção',
};

export const statusTone: Record<MetaControlAccount['operational_state'], string> = {
  delivering: 'border-emerald-300/20 bg-emerald-300/[0.07] text-emerald-200',
  idle: 'border-cyan-300/20 bg-cyan-300/[0.06] text-cyan-100',
  disabled: 'border-danger/20 bg-danger/[0.06] text-danger',
  unsettled: 'border-amber-300/20 bg-amber-300/[0.07] text-amber-100',
  attention: 'border-orange-300/20 bg-orange-300/[0.07] text-orange-100',
};

export function money(minor: string | number, currency: string): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(
    Number(minor) / 100,
  );
}

export function dateTime(value?: string | null): string {
  if (!value) return 'Nunca';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(value));
}

export function HealthRing({ score }: { score: number }) {
  const color = score >= 80 ? 'text-emerald-300' : score >= 50 ? 'text-amber-300' : 'text-danger';
  return (
    <div
      className={cn(
        'grid h-12 w-12 shrink-0 place-items-center rounded-full border bg-black/20 font-mono text-sm',
        color,
        score >= 80
          ? 'border-emerald-300/20'
          : score >= 50
            ? 'border-amber-300/20'
            : 'border-danger/20',
      )}
    >
      {score}
    </div>
  );
}
