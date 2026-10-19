'use client';

import { cn } from '@/lib/utils';

/**
 * The signal HUD at the top of the Tracker view.
 *
 * Two tiers, not six identical cards:
 *   - Tier 1: two hero readings (Compradores front, Faturamento) with big
 *     tabular figures and a satellite reading below each. If there are
 *     unmapped-front sales, that surfaces as an ember pulse next to buyers.
 *   - Tier 2: a HUD strip with the four supporting signals in compact
 *     lockup. Each has a mono value and a status pulse whose tone reflects
 *     the reading (data loss ember/scar, connect rate lush when >0).
 */

export type Summary = {
  visitors: number;
  ad_clicks: number;
  connected_clicks: number;
  checkouts: number;
  checkout_events: number;
  paid_buyers: number;
  failed_orders: number;
  upsell_orders: number;
  upsell_2_orders?: number;
  upsell_3_orders?: number;
  unmapped_paid_orders: number;
  paid_revenue_minor: string;
  paid_revenue_brl_minor: string;
  paid_revenue_usd_minor: string;
  unconverted_paid_orders: number;
  webhooks_received: number;
  webhooks_quarantined: number;
  refunded_orders?: number;
  refunded_revenue_brl_minor?: string;
  refunded_revenue_usd_minor?: string;
  chargeback_orders?: number;
  refund_chargeback_fee_count?: number;
  refund_chargeback_fee_brl_minor?: string;
  refund_chargeback_fee_usd_minor?: string;
  chargeback_revenue_brl_minor?: string;
  chargeback_revenue_usd_minor?: string;
  fee_vendepay_brl_minor?: string;
  fee_vendepay_usd_minor?: string;
  fee_extra_brl_minor?: string;
  fee_extra_usd_minor?: string;
  reserve_brl_minor?: string;
  reserve_usd_minor?: string;
  net_revenue_brl_minor?: string;
  net_revenue_usd_minor?: string;
  net_available_brl_minor?: string;
  net_available_usd_minor?: string;
  fee_settings?: { reserve_days: number };
};

export function percent(numerator: number, denominator: number) {
  if (!denominator) return null;
  return `${((numerator / denominator) * 100).toFixed(1).replace('.', ',')}%`;
}

export function integer(value: number | undefined) {
  return new Intl.NumberFormat('pt-BR').format(value ?? 0);
}

export function HeroReading({
  eyebrow,
  value,
  valueVariant = 'count',
  satellite,
}: {
  eyebrow: string;
  value: string;
  valueVariant?: 'count' | 'currency';
  satellite: React.ReactNode;
}) {
  return (
    <div className="tmx-kpi-hero">
      <p className="tmx-kpi-hero-eyebrow">{eyebrow}</p>
      <p
        className={cn(
          'mono-num tmx-kpi-hero-value',
          valueVariant === 'currency' && 'tmx-kpi-hero-value-currency',
        )}
      >
        {value}
      </p>
      <div className="tmx-kpi-hero-sat">{satellite}</div>
    </div>
  );
}

export function StripReading({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string | null;
  tone: 'lush' | 'ember' | 'scar' | 'signal' | 'muted';
}) {
  return (
    <div className="tmx-kpi-strip-cell">
      <div className="tmx-kpi-strip-head">
        <span
          className={cn('pulse-dot', tone === 'muted' && 'tmx-kpi-dot-muted')}
          data-tone={tone === 'muted' ? undefined : tone}
          aria-hidden
        />
        <span className="tmx-kpi-strip-label">{label}</span>
      </div>
      <p className="mono-num tmx-kpi-strip-value">{value}</p>
      {detail && <p className="tmx-kpi-strip-detail">{detail}</p>}
    </div>
  );
}
