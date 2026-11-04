import type { OfferStatus } from '@/lib/api-client';
import { cn } from '@/lib/utils';

const STATUS_META: Record<OfferStatus, { label: string; className: string }> = {
  testando: {
    label: 'Testando',
    className: 'border-warning/30 bg-warning/10 text-warning',
  },
  validando: {
    label: 'Validando',
    className: 'border-border bg-accent text-primary',
  },
  escala: {
    label: 'Escala',
    className: 'border-success/30 bg-success/10 text-success',
  },
  pausado: {
    label: 'Pausado',
    className: 'border-border bg-muted text-muted-foreground',
  },
  morrendo: {
    label: 'Morrendo',
    className: 'border-danger/30 bg-danger/10 text-danger',
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
