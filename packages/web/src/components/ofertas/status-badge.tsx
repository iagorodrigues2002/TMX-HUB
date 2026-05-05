import { cn } from '@/lib/utils';
import type { OfferStatus } from '@/lib/api-client';

const STATUS_META: Record<OfferStatus, { label: string; className: string }> = {
  testando: {
    label: 'Testando',
    className: 'border-amber-300/30 bg-amber-300/10 text-amber-200',
  },
  validando: {
    label: 'Validando',
    className: 'border-cyan-300/30 bg-cyan-300/10 text-cyan-200',
  },
  escala: {
    label: 'Escala',
    className: 'border-emerald-300/30 bg-emerald-300/10 text-emerald-200',
  },
  pausado: {
    label: 'Pausado',
    className: 'border-white/15 bg-white/[0.04] text-white/55',
  },
  morrendo: {
    label: 'Morrendo',
    className: 'border-rose-300/30 bg-rose-300/10 text-rose-200',
  },
};

export const STATUS_LIST: OfferStatus[] = [
  'testando',
  'validando',
  'escala',
  'pausado',
  'morrendo',
];

export function statusLabel(s: OfferStatus): string {
  return STATUS_META[s].label;
}

export function StatusBadge({ status, className }: { status: OfferStatus; className?: string }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]',
        meta.className,
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {meta.label}
    </span>
  );
}
