import type { FastifyInstance } from 'fastify';
import { SUPPORTED_CURRENCIES } from '../../integrations/vendepay/normalize.js';
import { NotFoundError, zodToProblem } from '../../lib/problem.js';
import { warmupBrlRates } from '../../services/exchange-rate.js';
import { gatewayFeesSchema } from '../../services/gateway-fees.js';
import {
  DEFAULT_FEE_SETTINGS,
  FeeSettingsSchema,
  type PaginationQuery,
  databaseUnavailable,
  pagination,
  parsePagination,
  parseTrackingDate,
} from './pagination-schema.js';

export function registerPutGatewayConnectionsConnectionIdFeesRoutes(app: FastifyInstance) {
  // Per-offer gateway fee configuration used to compute net revenue.
  app.put<{ Params: { id: string; connectionId: string } }>(
    '/offers/:id/tracking/gateway-connections/:connectionId/fees',
    async (req, reply) => {
      await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db) return reply.code(503).send(databaseUnavailable);
      const parsed = gatewayFeesSchema.safeParse(req.body);
      if (!parsed.success) throw zodToProblem(parsed.error);
      const [row] =
        await app.db`UPDATE tracking_gateway_connections SET fee_settings=${app.db.json(parsed.data)}
      WHERE id=${req.params.connectionId} AND project_id=(SELECT id FROM tracking_projects WHERE offer_id=${req.params.id}) RETURNING id,fee_settings`;
      if (!row) throw new NotFoundError('Conexão desta oferta não encontrada.');
      await app.invalidateAnalyticsCache({ offerId: req.params.id });
      return row;
    },
  );

  // Falls back to Vendepay's global defaults when nothing has been saved.
  app.get<{ Params: { id: string } }>('/offers/:id/tracking/fee-settings', async (req, reply) => {
    await app.offerStore.assertAccess(req.params.id, req.user!.sub, req.user!.role === 'admin');
    if (!app.db) return reply.code(503).send(databaseUnavailable);
    const [row] = await app.db<
      Array<{
        vendepay_fee_pct: string;
        extra_fee_minor: string;
        extra_fee_currency: string;
        reserve_pct: string;
        reserve_days: number;
        payout_days: number;
      }>
    >`
        SELECT vendepay_fee_pct, extra_fee_minor, extra_fee_currency, reserve_pct,
               reserve_days, payout_days
        FROM tracking_fee_settings
        WHERE project_id = (SELECT id FROM tracking_projects WHERE offer_id = ${req.params.id})
      `;
    const fee = row ?? DEFAULT_FEE_SETTINGS;
    return reply.send({
      vendepay_fee_pct: Number(fee.vendepay_fee_pct),
      extra_fee_minor: Number(fee.extra_fee_minor),
      extra_fee_currency: fee.extra_fee_currency,
      reserve_pct: Number(fee.reserve_pct),
      reserve_days: fee.reserve_days,
      payout_days: fee.payout_days,
      configured: Boolean(row),
    });
  });

  app.patch<{ Params: { id: string } }>('/offers/:id/tracking/fee-settings', async (req, reply) => {
    await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
    if (!app.db) return reply.code(503).send(databaseUnavailable);
    const parsed = FeeSettingsSchema.safeParse(req.body);
    if (!parsed.success) throw zodToProblem(parsed.error);
    const [project] = await app.db<{ id: string }[]>`
        SELECT id FROM tracking_projects WHERE offer_id = ${req.params.id}
      `;
    if (!project) return reply.code(409).send({ error: 'tracking_not_configured' });
    const {
      vendepay_fee_pct,
      extra_fee_minor,
      extra_fee_currency,
      reserve_pct,
      reserve_days,
      payout_days,
    } = parsed.data;
    await app.db`
        INSERT INTO tracking_fee_settings
          (project_id, vendepay_fee_pct, extra_fee_minor, extra_fee_currency, reserve_pct,
           reserve_days, payout_days, updated_at)
        VALUES
          (${project.id}, ${vendepay_fee_pct}, ${extra_fee_minor}, ${extra_fee_currency},
           ${reserve_pct}, ${reserve_days}, ${payout_days}, now())
        ON CONFLICT (project_id) DO UPDATE SET
          vendepay_fee_pct = EXCLUDED.vendepay_fee_pct,
          extra_fee_minor = EXCLUDED.extra_fee_minor,
          extra_fee_currency = EXCLUDED.extra_fee_currency,
          reserve_pct = EXCLUDED.reserve_pct,
          reserve_days = EXCLUDED.reserve_days,
          payout_days = EXCLUDED.payout_days,
          updated_at = now()
      `;
    await app.invalidateAnalyticsCache({ offerId: req.params.id });
    return reply.send({ ...parsed.data, configured: true });
  });

  // Refunds/chargebacks use immutable lifecycle timestamps. A replay may
  // update the row, but must never make an old refund appear as today's.
  app.get<{ Params: { id: string }; Querystring: PaginationQuery }>(
    '/offers/:id/tracking/refunds',
    async (req, reply) => {
      await app.offerStore.assertAccess(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db) return reply.code(503).send(databaseUnavailable);
      const { page, per_page: perPage, offset } = parsePagination(req.query);
      const { date, from, to } = parseTrackingDate(req.query);

      const [items, totals] = await Promise.all([
        app.db<
          Array<{
            id: string;
            provider: string;
            external_id: string;
            status: string;
            amount_minor: number | null;
            currency: string | null;
            amount_brl_minor: string | null;
            buyer: Record<string, unknown>;
            order_kind: string;
            occurred_at: string;
            updated_at: string;
          }>
        >`
          SELECT o.id, o.provider, o.external_id, o.status, o.amount_minor, o.currency,
                 o.amount_brl_minor, o.buyer, o.order_kind, o.occurred_at, o.updated_at
          FROM tracking_orders o
          JOIN tracking_projects p ON p.id = o.project_id
          WHERE p.offer_id = ${req.params.id}
            AND ((o.status = 'refunded' AND o.refunded_at >= ${from} AND o.refunded_at < ${to})
              OR (o.status = 'chargeback' AND o.chargeback_at >= ${from} AND o.chargeback_at < ${to}))
          ORDER BY COALESCE(o.refunded_at, o.chargeback_at) DESC, o.id DESC
          LIMIT ${perPage} OFFSET ${offset}
        `,
        app.db<
          Array<{
            total: number;
            refunded_orders: number;
            refunded_revenue_brl_minor: string;
            chargeback_orders: number;
            chargeback_revenue_brl_minor: string;
          }>
        >`
          SELECT
            count(*)::int AS total,
            count(*) FILTER (WHERE o.status = 'refunded')::int AS refunded_orders,
            COALESCE(sum(
              CASE
                WHEN o.status = 'refunded' AND o.amount_brl_minor IS NOT NULL THEN o.amount_brl_minor
                WHEN o.status = 'refunded' AND o.currency = 'BRL' THEN o.amount_minor
                WHEN o.status = 'refunded' AND rc.rate IS NOT NULL THEN (o.amount_minor * rc.rate)::bigint
                ELSE 0
              END
            ), 0)::text AS refunded_revenue_brl_minor,
            count(*) FILTER (WHERE o.status = 'chargeback')::int AS chargeback_orders,
            COALESCE(sum(
              CASE
                WHEN o.status = 'chargeback' AND o.amount_brl_minor IS NOT NULL THEN o.amount_brl_minor
                WHEN o.status = 'chargeback' AND o.currency = 'BRL' THEN o.amount_minor
                WHEN o.status = 'chargeback' AND rc.rate IS NOT NULL THEN (o.amount_minor * rc.rate)::bigint
                ELSE 0
              END
            ), 0)::text AS chargeback_revenue_brl_minor
          FROM tracking_orders o
          JOIN tracking_projects p ON p.id = o.project_id
          LEFT JOIN exchange_rate_cache rc
            ON rc.base_currency = o.currency AND rc.target_currency = 'BRL'
          WHERE p.offer_id = ${req.params.id}
            AND ((o.status = 'refunded' AND o.refunded_at >= ${from} AND o.refunded_at < ${to})
              OR (o.status = 'chargeback' AND o.chargeback_at >= ${from} AND o.chargeback_at < ${to}))
        `,
      ]);
      const total = totals[0]?.total ?? 0;
      return {
        date,
        time_zone: 'America/Sao_Paulo',
        items,
        totals: {
          refunded_orders: totals[0]?.refunded_orders ?? 0,
          refunded_revenue_brl_minor: totals[0]?.refunded_revenue_brl_minor ?? '0',
          chargeback_orders: totals[0]?.chargeback_orders ?? 0,
          chargeback_revenue_brl_minor: totals[0]?.chargeback_revenue_brl_minor ?? '0',
        },
        pagination: pagination(page, perPage, total),
      };
    },
  );

  // Warm the BRL exchange-rate cache for every currency we know about.
  // Idempotent: safe to call any time. Called by the "Atualizar cotações"
  // button in the ops panel.
  app.post<{ Params: { id: string } }>(
    '/offers/:id/tracking/exchange-rates/warmup',
    async (req, reply) => {
      await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db) return reply.code(503).send(databaseUnavailable);
      const result = await warmupBrlRates(SUPPORTED_CURRENCIES, app.db);
      return reply.send({
        supported_currencies: SUPPORTED_CURRENCIES,
        cached: result.cached,
        failed: result.failed,
        errors: result.errors,
      });
    },
  );
}
