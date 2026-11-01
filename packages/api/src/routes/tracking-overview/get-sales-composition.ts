import type { FastifyInstance } from 'fastify';
import { saoPauloParts } from '../../services/intraday-store.js';
import { naturalSale } from '../../services/sale-origin.js';
import { saoPauloDayRange } from '../../services/utmify-sync.js';
import { OverviewRangeSchema, databaseUnavailable } from './overview-range-schema.js';

export interface SalesCompositionRow {
  offer_id: string;
  classification: 'natural' | 'assisted' | 'unknown' | null;
  orders: number;
  fronts: number;
  upsells: number;
  customers: number;
  unidentified_orders: number;
  missing_amounts: number;
  revenue_brl_minor: string;
}

export function compositionTotals(
  rows: SalesCompositionRow[],
  basis: 'customers' | 'fronts' = 'customers',
) {
  const sum = (
    key: 'orders' | 'fronts' | 'upsells' | 'customers' | 'unidentified_orders' | 'missing_amounts',
  ) => rows.reduce((n, r) => n + Number(r[key]), 0);
  const revenue = rows.reduce((n, r) => n + Number(r.revenue_brl_minor), 0);
  const customers = sum('customers');
  const denominator = sum(basis);
  return {
    orders: sum('orders'),
    fronts: sum('fronts'),
    upsells: sum('upsells'),
    customers,
    unidentified_orders: sum('unidentified_orders'),
    missing_amounts: sum('missing_amounts'),
    revenue_brl_minor: String(revenue),
    arr_brl_minor:
      denominator > 0 &&
      (basis === 'fronts' || !sum('unidentified_orders')) &&
      !sum('missing_amounts')
        ? String(Math.round(revenue / denominator))
        : null,
  };
}

export function registerGetSalesComposition(app: FastifyInstance) {
  app.get('/tracking/sales-composition', async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: 'unauthorized' });
    if (!app.db) return reply.code(503).send(databaseUnavailable);
    const parsed = OverviewRangeSchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_date' });
    const now = new Date();
    const today = saoPauloParts(now).date;
    const fromDate = parsed.data.from ?? parsed.data.date ?? today;
    const toDate = parsed.data.to ?? parsed.data.date ?? today;
    const realDay = (day: string) => {
      const date = new Date(`${day}T12:00:00.000Z`);
      return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day;
    };
    if (!realDay(fromDate) || !realDay(toDate))
      return reply.code(400).send({ error: 'invalid_date' });
    if (fromDate > toDate || toDate > today)
      return reply.code(400).send({ error: 'invalid_range' });
    const offers = await app.offerStore.listAccessible(req.user.sub, req.user.role === 'admin');
    if (!offers.length) return { offers: [], from: fromDate, to: toDate };
    const from = new Date(saoPauloDayRange(fromDate, now).from);
    const to = new Date(saoPauloDayRange(toDate, now).to);
    const ids = offers.map((o) => o.id);
    // Frozen credits only classify matched purchases; an ambiguous historical sale is not natural by default.
    const rows = await app.db!<SalesCompositionRow[]>`
      WITH sales AS (
        SELECT p.offer_id,o.id,o.order_kind,
          COALESCE('email:'||COALESCE(NULLIF(lower(trim(o.buyer->>'email')),''),NULLIF(lower(trim(front.buyer->>'email')),'')),
            CASE WHEN length(regexp_replace(COALESCE(NULLIF(o.buyer->>'phone',''),front.buyer->>'phone',''),'[^0-9]','','g'))>=8
              THEN 'phone:'||regexp_replace(COALESCE(NULLIF(o.buyer->>'phone',''),front.buyer->>'phone'),'[^0-9]','','g') END) AS customer,
          CASE WHEN o.amount_brl_minor IS NOT NULL THEN o.amount_brl_minor
            WHEN o.currency='BRL' THEN o.amount_minor
            WHEN rc.rate IS NOT NULL THEN (o.amount_minor*rc.rate)::bigint ELSE NULL END AS amount,
          CASE WHEN ${naturalSale(app.db!)} THEN 'natural'
            WHEN credit.operator_id IS NOT NULL THEN 'assisted'
            ELSE 'unknown' END AS classification
        FROM tracking_orders o JOIN tracking_projects p ON p.id=o.project_id
        LEFT JOIN tracking_upsell_operator_credits credit ON credit.order_id=o.id AND credit.project_id=o.project_id
        LEFT JOIN tracking_orders front ON front.id=credit.front_order_id AND front.project_id=o.project_id AND front.order_kind='front'
        LEFT JOIN exchange_rate_cache rc ON rc.base_currency=o.currency AND rc.target_currency='BRL'
        WHERE p.offer_id=ANY(${ids}) AND p.enabled AND o.paid_at>=${from} AND o.paid_at<${to}
      )
      SELECT offer_id,classification,count(*)::int orders,
        count(*) FILTER(WHERE order_kind='front')::int fronts,
        count(*) FILTER(WHERE order_kind='upsell' OR order_kind ~ '^upsell_[0-9]+$')::int upsells,
        count(DISTINCT customer)::int customers,
        count(*) FILTER(WHERE customer IS NULL)::int unidentified_orders,
        count(*) FILTER(WHERE amount IS NULL)::int missing_amounts,
        COALESCE(sum(amount),0)::text revenue_brl_minor
      FROM sales GROUP BY GROUPING SETS ((offer_id,classification),(offer_id))`;
    return {
      from: fromDate,
      to: toDate,
      time_zone: 'America/Sao_Paulo',
      offers: offers.map((offer) => {
        const own = rows.filter((r) => r.offer_id === offer.id);
        return {
          offer_id: offer.id,
          offer_name: offer.name,
          owner_id: offer.userId,
          general: compositionTotals(
            own.filter((r) => r.classification === null),
            'fronts',
          ),
          natural: compositionTotals(own.filter((r) => r.classification === 'natural')),
          assisted: compositionTotals(own.filter((r) => r.classification === 'assisted')),
          unclassified: compositionTotals(own.filter((r) => r.classification === 'unknown')),
          unclassified_orders: own
            .filter((r) => r.classification === 'unknown')
            .reduce((n, r) => n + Number(r.orders), 0),
        };
      }),
    };
  });
}
