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
  delivering: 'border-success/30 bg-success/10 text-success',
  idle: 'border-border bg-accent text-primary',
  disabled: 'border-danger/20 bg-danger/[0.06] text-danger',
  unsettled: 'border-warning/30 bg-warning/10 text-warning',
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
  const color = score >= 80 ? 'text-success' : score >= 50 ? 'text-warning' : 'text-danger';
  return (
    <div
      className={cn(
        'grid h-12 w-12 shrink-0 place-items-center rounded-full border bg-accent font-mono text-sm',
        color,
        score >= 80 ? 'border-success/30' : score >= 50 ? 'border-warning/30' : 'border-danger/20',
      )}
    >
      {score}
    </div>
  );
}
