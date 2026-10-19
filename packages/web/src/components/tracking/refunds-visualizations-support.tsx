import type { apiClient } from '@/lib/api-client';

export type RefundReport = Awaited<ReturnType<typeof apiClient.getRefundsDashboard>>;

export function refundPercent(v: number | null | undefined, hidden: boolean) {
  return hidden
    ? '****'
    : v == null
      ? '—'
      : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
}

export const panel =
  'refund-panel min-w-0 rounded-2xl border border-white/10 bg-bg-elevated/70 p-5 sm:p-7';

export function Metric({
  label,
  value,
  detail,
  danger = false,
}: {
  label: string;
  value: string;
  detail: string;
  danger?: boolean;
}) {
  return (
    <div className={`refund-metric min-w-0 ${label === 'Impacto total' ? 'refund-impact' : ''}`}>
      <dt className="text-sm font-medium text-white/65">{label}</dt>
      <dd
        className={`mt-3 break-words text-[clamp(1.4rem,2vw,2rem)] font-semibold leading-tight tracking-tight tabular-nums ${danger ? 'text-rose-300' : 'text-white'}`}
      >
        {value}
      </dd>
      <p className="mt-2 text-xs leading-5 text-white/65">{detail}</p>
    </div>
  );
}

export function Change({
  label,
  value,
  suffix,
  hidden,
}: {
  label: string;
  value: number | null;
  suffix: string;
  hidden: boolean;
}) {
  return (
    <div>
      <p className="text-sm text-white/60">{label}</p>
      <p
        className={`mt-2 text-2xl font-semibold tracking-tight tabular-nums ${hidden ? 'text-white/60' : value != null && value < 0 ? 'text-emerald-300' : value != null && value > 0 ? 'text-rose-300' : 'text-white/60'}`}
      >
        {hidden
          ? '****'
          : value == null
            ? '—'
            : `${value > 0 ? '+' : ''}${value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ${suffix}`}
      </p>
      <p className="mt-1 text-xs text-white/50">
        {value == null
          ? 'Sem base anterior comparável'
          : hidden
            ? 'Comparação oculta'
            : value < 0
              ? 'Diminuiu'
              : value > 0
                ? 'Aumentou'
                : 'Sem alteração'}
      </p>
    </div>
  );
}

export type Point = {
  date: string;
  count: number;
  brl_minor: number;
  moving_average_brl_minor: number;
};

export type Delay = {
  mean_days: number | null;
  median_days: number | null;
  sample_count?: number;
  missing_paid_at?: number;
  missing_reversal_at?: number;
  negative_delay_orders?: number;
  buckets: Array<{ label: string; count: number }>;
};

export function Empty() {
  return (
    <p className="py-8 text-center text-sm text-white/50">Nenhum dado disponível neste filtro.</p>
  );
}
