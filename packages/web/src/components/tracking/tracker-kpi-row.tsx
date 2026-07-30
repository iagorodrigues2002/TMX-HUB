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

type Summary = {
  visitors: number;
  ad_clicks: number;
  connected_clicks: number;
  checkouts: number;
  checkout_events: number;
  paid_buyers: number;
  upsell_orders: number;
  unmapped_paid_orders: number;
  paid_revenue_minor: string;
  paid_revenue_brl_minor: string;
  unconverted_paid_orders: number;
  webhooks_received: number;
  webhooks_quarantined: number;
};

function money(minor: string | number | undefined) {
  const value = Number(minor ?? 0) / 100;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number.isFinite(value) ? value : 0);
}

function percent(numerator: number, denominator: number) {
  if (!denominator) return null;
  return `${((numerator / denominator) * 100).toFixed(1).replace('.', ',')}%`;
}

function integer(value: number | undefined) {
  return new Intl.NumberFormat('pt-BR').format(value ?? 0);
}

export function TrackerKpiRow({ summary }: { summary?: Summary }) {
  const s = summary;
  const buyersFront = s?.paid_buyers ?? 0;
  const upsells = s?.upsell_orders ?? 0;
  const unmapped = s?.unmapped_paid_orders ?? 0;
  // Faturamento is always displayed in BRL now, because ingestion converts
  // every non-BRL sale at the current AwesomeAPI rate. Fall back to the raw
  // sum only if the ingestion couldn't convert (rate unavailable) — in that
  // case the raw sum is a mix of currencies and technically wrong, but at
  // least it's non-zero so the operator knows sales are happening.
  const revenue = money(
    s?.paid_revenue_brl_minor && Number(s.paid_revenue_brl_minor) > 0
      ? s.paid_revenue_brl_minor
      : s?.paid_revenue_minor,
  );
  const connectRate = s?.ad_clicks ? percent(s.connected_clicks, s.ad_clicks) : null;
  const lossRate = s?.webhooks_received
    ? percent(s.webhooks_quarantined, s.webhooks_received)
    : null;
  const lossTone: 'lush' | 'ember' | 'scar' | 'muted' = !s?.webhooks_received
    ? 'muted'
    : s.webhooks_quarantined === 0
      ? 'lush'
      : s.webhooks_quarantined / s.webhooks_received > 0.1
        ? 'scar'
        : 'ember';
  const connectTone: 'lush' | 'signal' | 'muted' = !s?.ad_clicks
    ? 'muted'
    : s.connected_clicks / s.ad_clicks >= 0.5
      ? 'lush'
      : 'signal';

  return (
    <div className="tmx-kpi">
      <div className="tmx-kpi-tier1">
        <HeroReading
          eyebrow="Compradores front"
          value={integer(buyersFront)}
          satellite={
            <>
              <span className="tmx-kpi-sat-tag">upsell</span>
              <span className="mono-num tmx-kpi-sat-value">{integer(upsells)}</span>
              {unmapped > 0 && (
                <>
                  <span className="tmx-kpi-sat-sep" aria-hidden />
                  <span
                    className="pulse-dot"
                    data-tone="ember"
                    aria-label={`${unmapped} pedidos ainda sem classificação front/upsell`}
                  />
                  <span className="tmx-kpi-sat-tag tmx-kpi-sat-tag-warn">
                    {integer(unmapped)} não mapeados
                  </span>
                </>
              )}
            </>
          }
        />
        <HeroReading
          eyebrow="Faturamento"
          value={revenue}
          valueVariant="currency"
          satellite={
            <>
              <span className="tmx-kpi-sat-tag">visitas hoje</span>
              <span className="mono-num tmx-kpi-sat-value">{integer(s?.visitors)}</span>
            </>
          }
        />
      </div>

      <div className="tmx-kpi-tier2">
        <StripReading
          label="Connect rate"
          value={connectRate ?? '—'}
          detail={
            s?.ad_clicks ? `${integer(s.connected_clicks)}/${integer(s.ad_clicks)} cliques` : null
          }
          tone={connectTone}
        />
        <StripReading
          label="Checkouts"
          value={integer(s?.checkouts)}
          detail={s?.checkout_events ? `${integer(s.checkout_events)} disparos` : null}
          tone="signal"
        />
        <StripReading
          label="Pedidos totais"
          value={integer(buyersFront + upsells + unmapped)}
          detail={
            unmapped > 0
              ? `${integer(buyersFront)} front · ${integer(upsells)} upsell`
              : `${integer(buyersFront)} front · ${integer(upsells)} upsell`
          }
          tone={buyersFront + upsells > 0 ? 'lush' : 'muted'}
        />
        <StripReading
          label="Perda de dados"
          value={lossRate ?? '—'}
          detail={
            s?.webhooks_received
              ? `${integer(s.webhooks_quarantined)}/${integer(s.webhooks_received)} webhooks`
              : null
          }
          tone={lossTone}
        />
      </div>
    </div>
  );
}

function HeroReading({
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

function StripReading({
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
