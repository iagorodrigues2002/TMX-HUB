import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { VENDEPAY_PENALTY_MINOR } from '../lib/gateway-fee-model.js';
import { canAccessOffer } from '../services/offer-store.js';
import {
  type RefundOrder,
  buildRefundAnalytics,
  localDay,
  shiftDay,
  summarizeRefunds,
  validDate,
} from '../services/refund-analytics.js';
import {
  type RefundDateReceipt,
  recoverRefundDateEvidence,
} from '../services/refund-date-evidence.js';
import { saoPauloDayRange } from '../services/utmify-sync.js';

const schema = z.object({
  from: z.string().refine(validDate).optional(),
  to: z.string().refine(validDate).optional(),
  offer_id: z.string().min(1).optional(),
  product: z.string().min(1).max(300).optional(),
  vendepay: z.enum(['mainex', 'cobrak']).optional(),
  provider: z
    .string()
    .regex(/^[a-z_]+$/)
    .optional(),
  interval: z.enum(['day', 'week', 'month']).default('day'),
});
const plugin: FastifyPluginAsync = async (app) => {
  app.get('/tracking/refunds-dashboard', async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: 'unauthorized' });
    if (!app.db) return reply.code(503).send({ error: 'tracking_database_unavailable' });
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_refund_filter' });
    const asOf = new Date();
    const q = parsed.data;
    const today = localDay(asOf);
    const from = q.from ?? today;
    const to = q.to ?? today;
    if (from > to || to > today || Number(to.slice(0, 4)) - Number(from.slice(0, 4)) > 10)
      return reply.code(400).send({ error: 'invalid_range' });
    const accessible = (
      await app.offerStore.listAccessible(req.user.sub, req.user.role === 'admin')
    ).filter((o) => canAccessOffer(o, req.user!.sub, req.user!.role === 'admin'));
    // Admin visibility is not ownership. The company consolidation includes
    // only offers created by this profile and explicitly assigned to TMX.
    const offers = q.offer_id
      ? accessible.filter((o) => o.id === q.offer_id)
      : accessible.filter(
          (o) => o.userId === req.user!.sub && o.companyName?.trim().toLowerCase() === 'tmx',
        );
    if (q.offer_id && !offers.length) return reply.code(404).send({ error: 'offer_not_found' });
    const span = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
    const previousFrom = shiftDay(from, -span);
    const start = new Date(saoPauloDayRange(previousFrom).from);
    const end = new Date(saoPauloDayRange(to).to);
    const ids = offers.map((o) => o.id);
    const names = new Map(offers.map((o) => [o.id, o.name]));
    const rows = ids.length
      ? await app.db<
          Array<
            Record<string, unknown> & {
              id: string;
              offer_id: string;
              provider: string;
              connection_name: string;
              product_name: string;
              paid_at: string | null;
              reversal_at: string | null;
              amount_brl_minor: string | null;
              penalty_brl_minor: string | null;
            }
          >
        >`
      WITH scoped AS (
        SELECT o.*,p.offer_id,LEAST(o.refunded_at,o.chargeback_at) reversal_at,
          COALESCE(vc.payload_adapter,'') payload_adapter,
          COALESCE(NULLIF(o.product->>'name',''),'Produto não identificado') product_name,
          COALESCE(vc.name,gc.name,sc.name,INITCAP(o.provider)) connection_name,
          COALESCE(o.amount_brl_minor,CASE WHEN o.currency='BRL' THEN o.amount_minor WHEN amount_fx.rate IS NOT NULL THEN round(o.amount_minor*amount_fx.rate)::bigint END) brl,
          CASE WHEN lower(trim(o.provider))='vendepay' THEN jsonb_build_object('refund_fee_minor',${VENDEPAY_PENALTY_MINOR}::int,'chargeback_fee_minor',${VENDEPAY_PENALTY_MINOR}::int,'penalty_currency','USD')
            ELSE COALESCE(gc.fee_settings,sc.fee_settings,'{}'::jsonb) END fee_settings
        FROM tracking_orders o JOIN tracking_projects p ON p.id=o.project_id
        LEFT JOIN vendepay_connections vc ON vc.id=o.vendepay_connection_id AND vc.project_id=p.id
        LEFT JOIN tracking_gateway_connections gc ON gc.id=o.gateway_connection_id AND gc.project_id=p.id AND gc.provider=lower(trim(o.provider))
        LEFT JOIN syzepay_company_connections sc ON sc.id=o.syzepay_connection_id AND lower(trim(o.provider))='syzepay'
        LEFT JOIN exchange_rate_cache amount_fx ON amount_fx.base_currency=o.currency AND amount_fx.target_currency='BRL'
        WHERE p.offer_id=ANY(${ids})
          AND ((o.paid_at>=${start} AND o.paid_at<${end}) OR (LEAST(o.refunded_at,o.chargeback_at)>=${start} AND LEAST(o.refunded_at,o.chargeback_at)<${end}))
          AND (${q.product ?? null}::text IS NULL OR COALESCE(NULLIF(o.product->>'name',''),'Produto não identificado')=${q.product ?? null})
          AND (${q.provider ?? null}::text IS NULL OR lower(trim(o.provider))=${q.provider ?? null})
          AND (${q.vendepay ?? null}::text IS NULL OR (lower(trim(o.provider))='vendepay' AND (lower(COALESCE(vc.name,'')) LIKE '%'||${q.vendepay ?? null}||'%' OR (${q.vendepay ?? null}='mainex' AND lower(COALESCE(vc.name,'')) LIKE '%iago%') OR (${q.vendepay ?? null}='cobrak' AND lower(COALESCE(vc.name,'')) LIKE '%lucas%'))))
      ), tariffs AS (
        SELECT *,CASE WHEN chargeback_at IS NOT NULL AND (refunded_at IS NULL OR chargeback_at<refunded_at) THEN fee_settings->>'chargeback_fee_minor' ELSE fee_settings->>'refund_fee_minor' END fee_minor,
          COALESCE(fee_settings->>'penalty_currency',fee_settings->>'fee_currency') fee_currency FROM scoped
      ) SELECT t.id,t.offer_id,t.provider,t.connection_name,t.product_name,t.external_id,t.status,t.order_kind,
        jsonb_build_object('name',t.buyer->>'name','email',t.buyer->>'email') buyer,
        t.paid_at,t.reversal_at,t.payload_adapter,t.brl::text amount_brl_minor,
        CASE WHEN t.fee_minor ~ '^[0-9]{1,10}$' THEN CASE WHEN t.fee_minor::numeric=0 THEN 0 WHEN t.fee_currency='BRL' THEN t.fee_minor::numeric WHEN fx.rate IS NOT NULL THEN round(t.fee_minor::numeric*fx.rate) END END::text penalty_brl_minor
      FROM tariffs t LEFT JOIN exchange_rate_cache fx ON fx.base_currency=t.fee_currency AND fx.target_currency='BRL'
    `
      : [];
    const recoveryIds = rows
      .filter(
        (r) => r.provider === 'vendepay' && r.payload_adapter !== 'explodely' && r.reversal_at,
      )
      .map((r) => r.id);
    const receipts = recoveryIds.length
      ? await app.db<RefundDateReceipt[]>`
      SELECT wr.order_id,o.external_id,wr.payload,wr.received_at
      FROM webhook_receipts wr
      JOIN tracking_orders o ON o.id=wr.order_id AND o.provider='vendepay'
      JOIN vendepay_connections vc ON vc.id=wr.connection_id
        AND vc.id=o.vendepay_connection_id AND vc.project_id=o.project_id
      WHERE wr.order_id=ANY(${recoveryIds}) AND wr.state='processed'
        AND COALESCE(vc.payload_adapter,'')<>'explodely'
      ORDER BY wr.received_at,wr.id
    `
      : [];
    const normalized: RefundOrder[] = recoverRefundDateEvidence(
      rows.map((r) => ({
        ...r,
        offer_name: names.get(r.offer_id) ?? r.offer_id,
        amount_brl_minor: r.amount_brl_minor === null ? null : Number(r.amount_brl_minor),
        penalty_brl_minor: r.penalty_brl_minor === null ? null : Number(r.penalty_brl_minor),
      })),
      receipts,
    );
    const analytics = buildRefundAnalytics(normalized, from, to, q.interval, today);
    return {
      from,
      to,
      as_of: asOf.toISOString(),
      time_zone: 'America/Sao_Paulo',
      interval: q.interval,
      ...analytics,
      offers: analytics.rankings.offers.map((r) => ({
        ...r,
        offer_id: r.key,
        offer_name: r.label,
      })),
      products: analytics.rankings.products.map((r) => ({ ...r, product_name: r.label })),
      vendepays: [...new Set(normalized.map((r) => r.connection_name))].map((connection_name) => ({
        connection_name,
        ...summarizeRefunds(
          normalized.filter((r) => r.connection_name === connection_name),
          from,
          to,
        ),
      })),
      providers: [...new Set(normalized.map((r) => r.provider))].sort(),
      items: normalized
        .filter(
          (r) => r.reversal_at && localDay(r.reversal_at) >= from && localDay(r.reversal_at) <= to,
        )
        .sort((a, b) => Date.parse(b.reversal_at!) - Date.parse(a.reversal_at!))
        .slice(0, 500)
        .map((r) => ({ ...r, lifecycle_at: r.reversal_at, brl_minor: r.amount_brl_minor })),
      fee_basis: 'configured_gateway_penalties_cached_exchange_rate',
      cohort_basis: 'selected_purchase_dates_as_of_now',
      items_limit: 500,
    };
  });
};
export default plugin;
