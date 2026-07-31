import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { convertToBrlMinor } from '../services/exchange-rate.js';
import { saoPauloParts } from '../services/intraday-store.js';
import { saoPauloDayRange } from '../services/utmify-sync.js';

const OverviewDateSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

const DEFAULT_FEE_SETTINGS = {
  vendepay_fee_pct: '9.9',
  extra_fee_minor: '149',
  extra_fee_currency: 'USD',
  reserve_pct: '6.9',
};

const databaseUnavailable = {
  error: 'tracking_database_unavailable',
  detail: 'A infraestrutura de tracking está temporariamente indisponível.',
};

// Aggregate dashboard across every offer the caller can access — grouping
// gross revenue, refunds/chargebacks, gateway fees and net revenue into a
// single "visão geral" so nobody has to click through offers one by one.
const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get<{ Querystring: { date?: string } }>('/tracking/overview', async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: 'unauthorized' });
    if (!app.db) return reply.code(503).send(databaseUnavailable);

    const parsed = OverviewDateSchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_date' });
    const now = new Date();
    const today = saoPauloParts(now).date;
    const date = parsed.data.date ?? today;
    if (date > today) return reply.code(400).send({ error: 'date_in_future' });
    const range = saoPauloDayRange(date, now);
    const from = new Date(range.from);
    const to = new Date(range.to);

    const offers = await app.offerStore.listAccessible(req.user.sub, req.user.role === 'admin');
    if (offers.length === 0) {
      return reply.send({ date, time_zone: 'America/Sao_Paulo', offers: [], totals: null });
    }
    const offerIds = offers.map((offer) => offer.id);
    const offerNames = new Map(offers.map((offer) => [offer.id, offer.name] as const));

    const rows = await app.db<
      Array<{
        offer_id: string;
        paid_orders: number;
        paid_revenue_brl_minor: string;
        refunded_orders: number;
        refunded_revenue_brl_minor: string;
        chargeback_orders: number;
        chargeback_revenue_brl_minor: string;
        vendepay_fee_pct: string | null;
        extra_fee_minor: string | null;
        extra_fee_currency: string | null;
        reserve_pct: string | null;
      }>
    >`
      SELECT
        p.offer_id,
        (SELECT count(*)::int FROM tracking_orders o
          WHERE o.project_id = p.id AND o.status = 'paid'
            AND o.occurred_at >= ${from} AND o.occurred_at < ${to}) AS paid_orders,
        (SELECT COALESCE(sum(
            CASE
              WHEN o.amount_brl_minor IS NOT NULL THEN o.amount_brl_minor
              WHEN o.currency = 'BRL' THEN o.amount_minor
              WHEN rc.rate IS NOT NULL THEN (o.amount_minor * rc.rate)::bigint
              ELSE 0
            END
          ), 0)::text
          FROM tracking_orders o
          LEFT JOIN exchange_rate_cache rc
            ON rc.base_currency = o.currency AND rc.target_currency = 'BRL'
          WHERE o.project_id = p.id AND o.status = 'paid'
            AND o.occurred_at >= ${from} AND o.occurred_at < ${to}) AS paid_revenue_brl_minor,
        (SELECT count(*)::int FROM tracking_orders o
          WHERE o.project_id = p.id AND o.status = 'refunded'
            AND o.updated_at >= ${from} AND o.updated_at < ${to}) AS refunded_orders,
        (SELECT COALESCE(sum(
            CASE
              WHEN o.amount_brl_minor IS NOT NULL THEN o.amount_brl_minor
              WHEN o.currency = 'BRL' THEN o.amount_minor
              WHEN rc.rate IS NOT NULL THEN (o.amount_minor * rc.rate)::bigint
              ELSE 0
            END
          ), 0)::text
          FROM tracking_orders o
          LEFT JOIN exchange_rate_cache rc
            ON rc.base_currency = o.currency AND rc.target_currency = 'BRL'
          WHERE o.project_id = p.id AND o.status = 'refunded'
            AND o.updated_at >= ${from} AND o.updated_at < ${to}) AS refunded_revenue_brl_minor,
        (SELECT count(*)::int FROM tracking_orders o
          WHERE o.project_id = p.id AND o.status = 'chargeback'
            AND o.updated_at >= ${from} AND o.updated_at < ${to}) AS chargeback_orders,
        (SELECT COALESCE(sum(
            CASE
              WHEN o.amount_brl_minor IS NOT NULL THEN o.amount_brl_minor
              WHEN o.currency = 'BRL' THEN o.amount_minor
              WHEN rc.rate IS NOT NULL THEN (o.amount_minor * rc.rate)::bigint
              ELSE 0
            END
          ), 0)::text
          FROM tracking_orders o
          LEFT JOIN exchange_rate_cache rc
            ON rc.base_currency = o.currency AND rc.target_currency = 'BRL'
          WHERE o.project_id = p.id AND o.status = 'chargeback'
            AND o.updated_at >= ${from} AND o.updated_at < ${to}) AS chargeback_revenue_brl_minor,
        f.vendepay_fee_pct::text AS vendepay_fee_pct,
        f.extra_fee_minor::text AS extra_fee_minor,
        f.extra_fee_currency,
        f.reserve_pct::text AS reserve_pct
      FROM tracking_projects p
      LEFT JOIN tracking_fee_settings f ON f.project_id = p.id
      WHERE p.offer_id = ANY(${offerIds}) AND p.enabled = true
    `;

    const perOffer = await Promise.all(
      rows.map(async (row) => {
        const feePct = Number(row.vendepay_fee_pct ?? DEFAULT_FEE_SETTINGS.vendepay_fee_pct);
        const extraFeeMinor = Number(row.extra_fee_minor ?? DEFAULT_FEE_SETTINGS.extra_fee_minor);
        const extraFeeCurrency = row.extra_fee_currency ?? DEFAULT_FEE_SETTINGS.extra_fee_currency;
        const reservePct = Number(row.reserve_pct ?? DEFAULT_FEE_SETTINGS.reserve_pct);
        const extraFeeConversion = await convertToBrlMinor(
          extraFeeMinor,
          extraFeeCurrency,
          app.db!,
        );
        const extraFeeBrlMinor = (extraFeeConversion?.brlMinor ?? 0) * row.paid_orders;
        const grossBrlMinor = Number(row.paid_revenue_brl_minor);
        const refundedBrlMinor = Number(row.refunded_revenue_brl_minor);
        const chargebackBrlMinor = Number(row.chargeback_revenue_brl_minor);
        const feeVendepayBrlMinor = Math.round((grossBrlMinor * feePct) / 100);
        const reserveBrlMinor = Math.round((grossBrlMinor * reservePct) / 100);
        const netBrlMinor =
          grossBrlMinor -
          refundedBrlMinor -
          chargebackBrlMinor -
          feeVendepayBrlMinor -
          extraFeeBrlMinor;
        return {
          offer_id: row.offer_id,
          offer_name: offerNames.get(row.offer_id) ?? row.offer_id,
          paid_orders: row.paid_orders,
          gross_revenue_brl_minor: String(grossBrlMinor),
          refunded_orders: row.refunded_orders,
          refunded_revenue_brl_minor: String(refundedBrlMinor),
          chargeback_orders: row.chargeback_orders,
          chargeback_revenue_brl_minor: String(chargebackBrlMinor),
          fees_brl_minor: String(feeVendepayBrlMinor + extraFeeBrlMinor),
          reserve_brl_minor: String(reserveBrlMinor),
          net_revenue_brl_minor: String(netBrlMinor),
        };
      }),
    );

    perOffer.sort((a, b) => Number(b.net_revenue_brl_minor) - Number(a.net_revenue_brl_minor));

    const totals = perOffer.reduce(
      (acc, offer) => ({
        paid_orders: acc.paid_orders + offer.paid_orders,
        gross_revenue_brl_minor:
          acc.gross_revenue_brl_minor + Number(offer.gross_revenue_brl_minor),
        refunded_orders: acc.refunded_orders + offer.refunded_orders,
        refunded_revenue_brl_minor:
          acc.refunded_revenue_brl_minor + Number(offer.refunded_revenue_brl_minor),
        chargeback_orders: acc.chargeback_orders + offer.chargeback_orders,
        chargeback_revenue_brl_minor:
          acc.chargeback_revenue_brl_minor + Number(offer.chargeback_revenue_brl_minor),
        fees_brl_minor: acc.fees_brl_minor + Number(offer.fees_brl_minor),
        reserve_brl_minor: acc.reserve_brl_minor + Number(offer.reserve_brl_minor),
        net_revenue_brl_minor: acc.net_revenue_brl_minor + Number(offer.net_revenue_brl_minor),
      }),
      {
        paid_orders: 0,
        gross_revenue_brl_minor: 0,
        refunded_orders: 0,
        refunded_revenue_brl_minor: 0,
        chargeback_orders: 0,
        chargeback_revenue_brl_minor: 0,
        fees_brl_minor: 0,
        reserve_brl_minor: 0,
        net_revenue_brl_minor: 0,
      },
    );

    return reply.send({
      date,
      time_zone: 'America/Sao_Paulo',
      offers: perOffer,
      totals: {
        paid_orders: totals.paid_orders,
        gross_revenue_brl_minor: String(totals.gross_revenue_brl_minor),
        refunded_orders: totals.refunded_orders,
        refunded_revenue_brl_minor: String(totals.refunded_revenue_brl_minor),
        chargeback_orders: totals.chargeback_orders,
        chargeback_revenue_brl_minor: String(totals.chargeback_revenue_brl_minor),
        fees_brl_minor: String(totals.fees_brl_minor),
        reserve_brl_minor: String(totals.reserve_brl_minor),
        net_revenue_brl_minor: String(totals.net_revenue_brl_minor),
      },
    });
  });
};

export default plugin;
