import type { FastifyInstance } from 'fastify';
import type { GatewayOverviewRow } from '../../services/gateway-overview.js';

export async function loadOverviewRows(
  app: FastifyInstance,
  offerIds: string[],
  from: Date,
  to: Date,
  ownerId: string,
) {
  const rows = await app.db!<
    Array<{
      offer_id: string;
      paid_orders: number;
      paid_revenue_brl_minor: string;
      failed_orders: number;
      failed_revenue_brl_minor: string;
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
          WHERE o.project_id = p.id AND o.paid_at IS NOT NULL
            AND o.paid_at >= ${from} AND o.paid_at < ${to}) AS paid_orders,
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
          WHERE o.project_id = p.id AND o.paid_at IS NOT NULL
            AND o.paid_at >= ${from} AND o.paid_at < ${to}) AS paid_revenue_brl_minor,
        (SELECT count(*)::int FROM tracking_orders o
          WHERE o.project_id = p.id
            AND o.status IN ('refused', 'failed', 'cancelled')
            AND o.paid_at IS NULL
            AND CASE
              WHEN o.status = 'cancelled' THEN COALESCE(o.cancelled_at, o.updated_at)
              ELSE o.occurred_at
            END >= ${from}
            AND CASE
              WHEN o.status = 'cancelled' THEN COALESCE(o.cancelled_at, o.updated_at)
              ELSE o.occurred_at
            END < ${to}) AS failed_orders,
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
          WHERE o.project_id = p.id
            AND o.status IN ('refused', 'failed', 'cancelled')
            AND o.paid_at IS NULL
            AND CASE
              WHEN o.status = 'cancelled' THEN COALESCE(o.cancelled_at, o.updated_at)
              ELSE o.occurred_at
            END >= ${from}
            AND CASE
              WHEN o.status = 'cancelled' THEN COALESCE(o.cancelled_at, o.updated_at)
              ELSE o.occurred_at
            END < ${to}) AS failed_revenue_brl_minor,
        (SELECT count(*)::int FROM tracking_orders o
          WHERE o.project_id = p.id AND o.refunded_at IS NOT NULL
            AND (o.chargeback_at IS NULL OR o.refunded_at <= o.chargeback_at)
            AND o.refunded_at >= ${from} AND o.refunded_at < ${to}) AS refunded_orders,
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
          WHERE o.project_id = p.id AND o.refunded_at IS NOT NULL
            AND (o.chargeback_at IS NULL OR o.refunded_at <= o.chargeback_at)
            AND o.refunded_at >= ${from} AND o.refunded_at < ${to}) AS refunded_revenue_brl_minor,
        (SELECT count(*)::int FROM tracking_orders o
          WHERE o.project_id = p.id AND o.chargeback_at IS NOT NULL
            AND (o.refunded_at IS NULL OR o.chargeback_at < o.refunded_at)
            AND o.chargeback_at >= ${from} AND o.chargeback_at < ${to}) AS chargeback_orders,
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
          WHERE o.project_id = p.id AND o.chargeback_at IS NOT NULL
            AND (o.refunded_at IS NULL OR o.chargeback_at < o.refunded_at)
            AND o.chargeback_at >= ${from} AND o.chargeback_at < ${to}) AS chargeback_revenue_brl_minor,
        f.vendepay_fee_pct::text AS vendepay_fee_pct,
        f.extra_fee_minor::text AS extra_fee_minor,
        f.extra_fee_currency,
        f.reserve_pct::text AS reserve_pct
      FROM tracking_projects p
      LEFT JOIN tracking_fee_settings f ON f.project_id = p.id
      WHERE p.offer_id = ANY(${offerIds}) AND p.enabled = true
    `;

  const gatewayRows = await app.db!<GatewayOverviewRow[]>`
            WITH scoped AS (
              SELECT p.offer_id,COALESCE(NULLIF(lower(trim(o.provider)),''),'unknown') AS provider,o.order_kind,
                CASE WHEN o.amount_brl_minor IS NOT NULL THEN o.amount_brl_minor
                  WHEN o.currency='BRL' THEN o.amount_minor
                  WHEN rc.rate IS NOT NULL THEN (o.amount_minor*rc.rate)::bigint ELSE NULL END AS amount
              FROM tracking_orders o JOIN tracking_projects p ON p.id=o.project_id
              LEFT JOIN exchange_rate_cache rc ON rc.base_currency=o.currency AND rc.target_currency='BRL'
              WHERE p.offer_id=ANY(${offerIds}) AND p.enabled AND o.paid_at>=${from} AND o.paid_at<${to}
            )
            SELECT offer_id,provider,count(*)::int transactions,
              count(*) FILTER(WHERE order_kind='front')::int fronts,
              count(*) FILTER(WHERE order_kind='upsell' OR order_kind LIKE 'upsell_%')::int upsells,
              COALESCE(sum(amount),0)::text gross_brl_minor,count(*) FILTER(WHERE amount IS NULL)::int missing_amounts
            FROM scoped GROUP BY offer_id,provider`;
  // Company-wide SyzePay receipts are visible only to their owner; an
  // invitation to one offer never grants access to the company inbox.
  const syzeRows = await app.db!<{ company_name: string; pending_events: number }[]>`
            SELECT c.company_name,count(r.id)::int pending_events
            FROM syzepay_company_connections c LEFT JOIN syzepay_inbox_receipts r ON r.connection_id=c.id
              AND r.received_at>=${from} AND r.received_at<${to} AND r.state='awaiting_mapping'
            WHERE c.owner_id=${ownerId} GROUP BY c.company_name`;
  return { rows, gatewayRows, syzeRows };
}
