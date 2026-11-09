import type { Sql } from 'postgres';
import { normalizeAdAttribution } from '../lib/ad-attribution.js';
import { VENDEPAY_PENALTY_MINOR, gatewayFeesSchema } from '../lib/gateway-fee-model.js';
import { type FeeBucket, calculateGatewayFee } from './gateway-fees.js';
import { loadReceivedReversals } from './refund-receipts.js';
import { naturalSale, refundOriginFilter } from './sale-origin.js';

export interface TrafficAttributionRow {
  offerId: string;
  campaignId: string | null;
  adsetId: string | null;
  adId: string | null;
  accountId: string | null;
  fronts: number;
  upsells: number;
  grossBrlMinor: string | null;
  netBrlMinor: string | null;
  grossUsdMinor: string | null;
  netUsdMinor: string | null;
  naturalUpsells: number;
  clickedUpsells: number;
  naturalGrossBrlMinor: string | null;
  clickedGrossBrlMinor: string | null;
  naturalGrossUsdMinor: string | null;
  clickedGrossUsdMinor: string | null;
}
interface AttributionInputRow {
  id: string;
  offer_id: string;
  provider: string;
  connection_key?: string;
  order_kind?: string;
  paid?: boolean | null;
  refunded?: boolean;
  chargeback?: boolean;
  reversed?: boolean;
  is_natural?: boolean;
  is_clicked?: boolean;
  amount?: string | number | null;
  reported_fee?: string | number | null;
  source?: Record<string, string> | null;
  page_source?: Record<string, string> | null;
  source_url?: string | null;
  settings?: unknown;
}
const metaId = (v: unknown) => (typeof v === 'string' && /^\d+$/.test(v) ? v : null);
function sourceIds(source: Record<string, string>) {
  const s = normalizeAdAttribution(source);
  return {
    campaignId: metaId(s.campaign_id) ?? metaId(s.utm_id) ?? metaId(s.utm_campaign),
    adsetId: metaId(s.adset_id) ?? metaId(s.utm_term),
    adId: metaId(s.ad_id) ?? metaId(s.utm_content),
    accountId: metaId(s.ad_account_id) ?? metaId(s.account_id),
  };
}
export async function loadTrafficAttribution(
  db: Sql,
  offerIds: string[],
  from: Date,
  to: Date,
): Promise<TrafficAttributionRow[]> {
  if (!offerIds.length) return [];
  const reversals = await loadReceivedReversals(db, offerIds, from, to, 'general');
  const rows = await db<AttributionInputRow[]>`
    WITH unique_front AS (
      SELECT o.project_id,o.visitor_id,min(o.id) AS id FROM tracking_orders o
      JOIN tracking_projects p ON p.id=o.project_id
      WHERE p.offer_id=ANY(${offerIds}) AND o.order_kind='front' AND o.paid_at IS NOT NULL
        AND NULLIF(o.visitor_id,'') IS NOT NULL
      GROUP BY o.project_id,o.visitor_id HAVING count(*)=1
    )
    SELECT o.id,p.offer_id,o.order_kind,lower(trim(o.provider)) AS provider,
      ${naturalSale(db)} AS is_natural,${refundOriginFilter(db, 'assisted')} AS is_clicked,
      o.paid_at>=${from} AND o.paid_at<${to} AS paid,
      o.id=ANY(${reversals.refunded}) AS refunded,o.id=ANY(${reversals.chargeback}) AS chargeback,
      COALESCE(o.amount_brl_minor,CASE WHEN o.currency='BRL' THEN o.amount_minor
        WHEN rc.rate IS NOT NULL THEN (o.amount_minor*rc.rate)::bigint END)::text AS amount,
      o.status IN ('refunded','chargeback') OR o.refunded_at IS NOT NULL OR o.chargeback_at IS NOT NULL AS reversed,
      CASE WHEN lower(trim(o.provider))='syzepay' AND o.attribution_source->>'gateway_fee_in_cents' ~ '^[0-9]{1,15}$'
        THEN o.attribution_source->>'gateway_fee_in_cents' END AS reported_fee,
      CASE WHEN front.id IS NULL THEN COALESCE(o.attribution_source,'{}'::jsonb) ELSE COALESCE(front.attribution_source,'{}'::jsonb) END AS source,
      page.source AS page_source,
      page.event_url AS source_url,
      CASE WHEN lower(trim(o.provider))='vendepay' THEN 'vendepay' ELSE COALESCE(o.gateway_connection_id,o.syzepay_connection_id,'unassigned') END AS connection_key,
      CASE WHEN lower(trim(o.provider))='vendepay' THEN jsonb_build_object(
        'fee_pct',COALESCE(f.vendepay_fee_pct,9.9),'fixed_fee_minor',COALESCE(f.extra_fee_minor,149),
        'fee_currency',COALESCE(f.extra_fee_currency,'USD'),'reserve_pct',COALESCE(f.reserve_pct,6.9),
        'chargeback_fee_minor',${VENDEPAY_PENALTY_MINOR}::int,'refund_fee_minor',${VENDEPAY_PENALTY_MINOR}::int,'penalty_currency','USD')
        ELSE COALESCE(gc.fee_settings,sc.fee_settings,'{}'::jsonb) END AS settings
    FROM tracking_orders o JOIN tracking_projects p ON p.id=o.project_id
    LEFT JOIN tracking_upsell_operator_credits credit ON credit.order_id=o.id AND credit.project_id=o.project_id
    LEFT JOIN unique_front uf ON uf.project_id=o.project_id AND uf.visitor_id=o.visitor_id
    LEFT JOIN tracking_orders front ON front.project_id=o.project_id AND front.id=COALESCE(credit.front_order_id,uf.id)
      AND front.order_kind='front' AND front.paid_at<=o.paid_at AND (o.order_kind='upsell' OR o.order_kind ~ '^upsell_[0-9]+$')
    LEFT JOIN LATERAL (SELECT e.source,e.event_url FROM tracking_events e WHERE e.project_id=o.project_id
      AND e.visitor_id=COALESCE(front.visitor_id,o.visitor_id) AND e.event_name='PageView'
      AND e.received_at<=COALESCE(front.paid_at,o.paid_at,o.occurred_at)
      ORDER BY e.received_at DESC,e.id DESC LIMIT 1) page ON true
    LEFT JOIN exchange_rate_cache rc ON rc.base_currency=o.currency AND rc.target_currency='BRL'
    LEFT JOIN tracking_fee_settings f ON f.project_id=p.id
    LEFT JOIN tracking_gateway_connections gc ON gc.id=o.gateway_connection_id AND gc.project_id=p.id AND gc.provider=o.provider
    LEFT JOIN syzepay_company_connections sc ON sc.id=o.syzepay_connection_id AND o.provider='syzepay'
    WHERE p.enabled AND p.offer_id=ANY(${offerIds}) AND ((o.paid_at>=${from} AND o.paid_at<${to})
      OR o.id=ANY(${reversals.refunded}) OR o.id=ANY(${reversals.chargeback})) LIMIT 200001`;
  if (rows.length > 200000) throw Error('Attribution report too large');
  const rates = await db<
    { base_currency: string; rate: string }[]
  >`SELECT base_currency,rate::text FROM exchange_rate_cache WHERE target_currency='BRL'`;
  return aggregateTrafficAttribution(
    rows,
    new Map([
      ['BRL', 1],
      ...rates
        .filter((r) => Number.isFinite(Number(r.rate)) && Number(r.rate) > 0)
        .map((r) => [r.base_currency, Number(r.rate)] as [string, number]),
    ]),
  );
}

export function aggregateTrafficAttribution(
  rows: AttributionInputRow[],
  rates: Map<string, number>,
): TrafficAttributionRow[] {
  const groups = new Map<
    string,
    {
      result: TrafficAttributionRow;
      gross: number;
      naturalGross: number;
      clickedGross: number;
      naturalMissing: boolean;
      clickedMissing: boolean;
      reversals: number;
      missing: boolean;
      buckets: Map<string, FeeBucket>;
    }
  >();
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    const ids = sourceIds(row.source ?? {});
    const fallbacks = [row.page_source ?? {}];
    try {
      const url = new URL(row.source_url ?? '');
      if (['https:', 'http:'].includes(url.protocol))
        fallbacks.push(Object.fromEntries(url.searchParams));
    } catch {}
    // Normalize each origin separately so an older PageView cannot override the paid order.
    for (const source of fallbacks) {
      const candidate = sourceIds(source);
      const sharedOrigin =
        (!ids.campaignId && !ids.adId && !ids.adsetId) ||
        (ids.campaignId && ids.campaignId === candidate.campaignId) ||
        (ids.adId && ids.adId === candidate.adId) ||
        (ids.adsetId && ids.adsetId === candidate.adsetId);
      if (
        sharedOrigin &&
        (!ids.campaignId || !candidate.campaignId || ids.campaignId === candidate.campaignId) &&
        (!ids.adId || !candidate.adId || ids.adId === candidate.adId) &&
        (!ids.adsetId || !candidate.adsetId || ids.adsetId === candidate.adsetId) &&
        (!ids.accountId || !candidate.accountId || ids.accountId === candidate.accountId)
      ) {
        ids.campaignId ??= candidate.campaignId;
        ids.adsetId ??= candidate.adsetId;
        ids.adId ??= candidate.adId;
        ids.accountId ??= candidate.accountId;
      }
    }
    const result: TrafficAttributionRow = {
      offerId: row.offer_id,
      ...ids,
      fronts: 0,
      upsells: 0,
      naturalUpsells: 0,
      clickedUpsells: 0,
      naturalGrossBrlMinor: null,
      clickedGrossBrlMinor: null,
      naturalGrossUsdMinor: null,
      clickedGrossUsdMinor: null,
      grossBrlMinor: null,
      netBrlMinor: null,
      grossUsdMinor: null,
      netUsdMinor: null,
    };
    const key = JSON.stringify([
      result.offerId,
      result.campaignId,
      result.adsetId,
      result.adId,
      result.accountId,
    ]);
    const g = groups.get(key) ?? {
      result,
      gross: 0,
      naturalGross: 0,
      clickedGross: 0,
      naturalMissing: false,
      clickedMissing: false,
      reversals: 0,
      missing: false,
      buckets: new Map<string, FeeBucket>(),
    };
    const amount = row.amount == null ? null : Number(row.amount);
    if (amount == null || !Number.isSafeInteger(amount) || amount < 0) g.missing = true;
    if (row.paid) {
      g.gross += amount ?? 0;
      g.result.fronts += row.order_kind === 'front' ? 1 : 0;
      g.result.upsells += /^upsell(?:_\d+)?$/.test(row.order_kind ?? '') ? 1 : 0;
    }
    if (row.paid) {
      const upsell = /^upsell(?:_\d+)?$/.test(row.order_kind ?? '');
      const missing = amount == null || !Number.isSafeInteger(amount) || amount < 0;
      if (row.is_natural === true && row.is_clicked !== true) {
        g.naturalGross += amount ?? 0;
        g.naturalMissing ||= missing;
        g.result.naturalUpsells += upsell ? 1 : 0;
      }
      if (row.is_clicked === true && row.is_natural !== true) {
        g.clickedGross += amount ?? 0;
        g.clickedMissing ||= missing;
        g.result.clickedUpsells += upsell ? 1 : 0;
      }
    }
    if (row.refunded || row.chargeback) g.reversals += amount ?? 0;
    const bucketKey = JSON.stringify([row.provider, row.connection_key, row.settings]);
    const b = g.buckets.get(bucketKey) ?? {
      offer_id: row.offer_id,
      provider: row.provider,
      gross_brl_minor: '0',
      sales: 0,
      refunds: 0,
      chargebacks: 0,
      settings: row.settings,
      reported_fee_brl_minor: '0',
      reported_fee_sales: 0,
      retained_reserve_brl_minor: '0',
    };
    if (row.paid) {
      b.sales++;
      b.gross_brl_minor = String(Number(b.gross_brl_minor) + (amount ?? 0));
      const config = gatewayFeesSchema.safeParse(row.settings);
      if (row.provider === 'vendepay' && !row.reversed && config.success)
        b.retained_reserve_brl_minor = String(
          Number(b.retained_reserve_brl_minor) +
            Math.round(((amount ?? 0) * config.data.reserve_pct) / 100),
        );
      if (row.reported_fee != null && Number(row.reported_fee) <= Number(amount)) {
        b.reported_fee_sales = (b.reported_fee_sales ?? 0) + 1;
        b.reported_fee_brl_minor = String(
          Number(b.reported_fee_brl_minor) + Number(row.reported_fee),
        );
      }
    }
    b.refunds += row.refunded ? 1 : 0;
    b.chargebacks += row.chargeback ? 1 : 0;
    g.buckets.set(bucketKey, b);
    groups.set(key, g);
  }
  const convert = (n: number, currency: string) =>
    n === 0 ? 0 : rates.get(currency) ? Math.round(n * rates.get(currency)!) : null;
  const money = (n: number) => (Number.isSafeInteger(n) ? String(n) : null);
  return [...groups.values()].map((g) => {
    let deductions = 0;
    let missingNet = g.missing;
    for (const b of g.buckets.values()) {
      const c = gatewayFeesSchema.safeParse(b.settings);
      let tariffs = null;
      if (c.success) {
        const m = c.data;
        const fixed =
          m.fee_source === 'webhook' && b.provider === 'syzepay'
            ? 0
            : convert(m.fixed_fee_minor, m.fee_currency);
        const refund = convert(m.refund_fee_minor, m.penalty_currency ?? m.fee_currency);
        const chargeback = convert(m.chargeback_fee_minor, m.penalty_currency ?? m.fee_currency);
        if (fixed != null && refund != null && chargeback != null)
          tariffs = { fixed, refund, chargeback };
      }
      const fee = calculateGatewayFee(b, tariffs);
      if (fee.missing_operations) missingNet = true;
      deductions += fee.fees_brl_minor + fee.reserve_brl_minor + fee.penalty_brl_minor;
    }
    const usd = rates.get('USD');
    const net = g.gross - g.reversals - deductions;
    return {
      ...g.result,
      naturalGrossBrlMinor: g.naturalMissing ? null : money(g.naturalGross),
      clickedGrossBrlMinor: g.clickedMissing ? null : money(g.clickedGross),
      naturalGrossUsdMinor:
        g.naturalMissing || !usd ? null : money(Math.round(g.naturalGross / usd)),
      clickedGrossUsdMinor:
        g.clickedMissing || !usd ? null : money(Math.round(g.clickedGross / usd)),
      grossBrlMinor: g.missing ? null : money(g.gross),
      netBrlMinor: missingNet ? null : money(net),
      grossUsdMinor: g.missing || !usd ? null : money(Math.round(g.gross / usd)),
      netUsdMinor: missingNet || !usd ? null : money(Math.round(net / usd)),
    };
  });
}
