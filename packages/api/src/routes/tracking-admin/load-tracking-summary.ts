import type { FastifyInstance, FastifyRequest } from 'fastify';
export async function loadTrackingSummary(
  app: FastifyInstance,
  req: FastifyRequest<{ Params: { id: string } }>,
  from: Date,
  to: Date,
) {
  const [summary] = await app.db!<
    Array<{
      events: number;
      visitors: number;
      page_views: number;
      ad_clicks: number;
      connected_clicks: number;
      checkouts: number;
      checkout_events: number;
      orders: number;
      paid_orders: number;
      failed_orders: number;
      paid_buyers: number;
      upsell_orders: number;
      upsell_2_orders: number;
      upsell_3_orders: number;
      unmapped_paid_orders: number;
      orphan_orders: number;
      paid_revenue_minor: string;
      paid_revenue_brl_minor: string;
      paid_revenue_usd_minor: string;
      unconverted_paid_orders: number;
      refunded_orders: number;
      refunded_revenue_brl_minor: string;
      chargeback_orders: number;
      chargeback_revenue_brl_minor: string;
      webhooks_received: number;
      webhooks_quarantined: number;
      utmify_deliveries_attempted: number;
      utmify_deliveries_lost: number;
    }>
  >`
      WITH event_stats AS (
        SELECT
          project_id,
          count(*) FILTER (WHERE received_at < ${to})::int AS events,
          count(DISTINCT visitor_id) FILTER (WHERE received_at < ${to})::int AS visitors,
          count(*) FILTER (WHERE event_name = 'PageView' AND received_at < ${to})::int
            AS page_views,
          count(DISTINCT visitor_id) FILTER (
            WHERE event_name = 'AdClick' AND received_at < ${to}
          )::int AS ad_clicks,
          count(DISTINCT visitor_id) FILTER (
            WHERE event_name = 'AdClick'
              AND received_at < ${to}
              AND next_page_at < received_at + interval '30 minutes'
          )::int AS connected_clicks,
          count(DISTINCT visitor_id) FILTER (
            WHERE event_name = 'InitiateCheckout' AND received_at < ${to}
          )::int AS checkouts,
          count(*) FILTER (
            WHERE event_name = 'InitiateCheckout' AND received_at < ${to}
          )::int AS checkout_events
        FROM (
          SELECT
            e.project_id,
            e.visitor_id,
            e.event_name,
            e.received_at,
            min(e.received_at) FILTER (WHERE e.event_name = 'PageView') OVER (
              PARTITION BY e.project_id, e.visitor_id
              ORDER BY e.received_at
              RANGE BETWEEN CURRENT ROW AND UNBOUNDED FOLLOWING
            ) AS next_page_at
          FROM tracking_events e
          JOIN tracking_projects project ON project.id = e.project_id
          WHERE project.offer_id = ${req.params.id}
            AND e.received_at >= ${from}
            AND e.received_at < ${to} + interval '30 minutes'
        ) events_in_range
        GROUP BY project_id
      ),
      order_stats AS (
        SELECT
          o.project_id,
          count(*) FILTER (
            WHERE o.occurred_at >= ${from} AND o.occurred_at < ${to}
          )::int AS orders,
          count(*) FILTER (
            WHERE o.paid_at >= ${from} AND o.paid_at < ${to}
          )::int AS paid_orders,
          count(*) FILTER (
            WHERE o.status IN ('refused', 'failed', 'cancelled')
              AND o.paid_at IS NULL
              AND CASE
                WHEN o.status = 'cancelled' THEN COALESCE(o.cancelled_at, o.updated_at)
                ELSE o.occurred_at
              END >= ${from}
              AND CASE
                WHEN o.status = 'cancelled' THEN COALESCE(o.cancelled_at, o.updated_at)
                ELSE o.occurred_at
              END < ${to}
          )::int AS failed_orders,
          count(DISTINCT COALESCE(
            NULLIF(lower(trim(o.buyer->>'email')), ''),
            NULLIF(regexp_replace(o.buyer->>'phone', '\D', '', 'g'), ''),
            NULLIF(trim(o.visitor_id), ''),
            o.external_id
          )) FILTER (
            WHERE o.paid_at >= ${from} AND o.paid_at < ${to} AND o.order_kind = 'front'
          )::int AS paid_buyers,
          count(DISTINCT COALESCE(
            NULLIF(lower(trim(o.buyer->>'email')), ''),
            NULLIF(regexp_replace(o.buyer->>'phone', '\D', '', 'g'), ''),
            NULLIF(trim(o.visitor_id), ''),
            o.external_id
          )) FILTER (
            WHERE o.paid_at >= ${from} AND o.paid_at < ${to} AND o.order_kind = 'upsell'
          )::int AS upsell_orders,
          count(DISTINCT COALESCE(
            NULLIF(lower(trim(o.buyer->>'email')), ''),
            NULLIF(regexp_replace(o.buyer->>'phone', '\D', '', 'g'), ''),
            NULLIF(trim(o.visitor_id), ''),
            o.external_id
          )) FILTER (
            WHERE o.paid_at >= ${from} AND o.paid_at < ${to} AND o.order_kind = 'upsell_2'
          )::int AS upsell_2_orders,
          count(DISTINCT COALESCE(
            NULLIF(lower(trim(o.buyer->>'email')), ''),
            NULLIF(regexp_replace(o.buyer->>'phone', '\D', '', 'g'), ''),
            NULLIF(trim(o.visitor_id), ''),
            o.external_id
          )) FILTER (
            WHERE o.paid_at >= ${from} AND o.paid_at < ${to} AND o.order_kind = 'upsell_3'
          )::int AS upsell_3_orders,
          count(*) FILTER (
            WHERE o.paid_at >= ${from} AND o.paid_at < ${to} AND o.order_kind = 'unknown'
          )::int AS unmapped_paid_orders,
          count(*) FILTER (
            WHERE NULLIF(trim(o.visitor_id), '') IS NULL
              AND o.occurred_at >= ${from} AND o.occurred_at < ${to}
          )::int AS orphan_orders,
          COALESCE(sum(o.amount_minor) FILTER (
            WHERE o.paid_at >= ${from} AND o.paid_at < ${to}
          ), 0)::text AS paid_revenue_minor,
          COALESCE(sum(
            CASE
              WHEN o.amount_brl_minor IS NOT NULL THEN o.amount_brl_minor
              WHEN o.currency = 'BRL' THEN o.amount_minor
              WHEN rc.rate IS NOT NULL THEN (o.amount_minor * rc.rate)::bigint
              ELSE 0
            END
          ) FILTER (
            WHERE o.paid_at >= ${from} AND o.paid_at < ${to}
          ), 0)::text AS paid_revenue_brl_minor,
          COALESCE(sum(
            CASE
              WHEN o.currency = 'USD' THEN o.amount_minor
              WHEN o.currency = 'BRL' AND usd.rate IS NOT NULL
                THEN (o.amount_minor / usd.rate)::bigint
              WHEN o.amount_brl_minor IS NOT NULL AND usd.rate IS NOT NULL
                THEN (o.amount_brl_minor / usd.rate)::bigint
              WHEN rc.rate IS NOT NULL AND usd.rate IS NOT NULL
                THEN ((o.amount_minor * rc.rate) / usd.rate)::bigint
              ELSE 0
            END
          ) FILTER (
            WHERE o.paid_at >= ${from} AND o.paid_at < ${to}
          ), 0)::text AS paid_revenue_usd_minor,
          count(*) FILTER (
            WHERE o.paid_at >= ${from} AND o.paid_at < ${to}
              AND o.amount_minor IS NOT NULL
              AND o.amount_brl_minor IS NULL
              AND o.currency <> 'BRL'
              AND rc.rate IS NULL
          )::int AS unconverted_paid_orders,
          count(*) FILTER (
            WHERE o.refunded_at >= ${from} AND o.refunded_at < ${to}
          )::int AS refunded_orders,
          COALESCE(sum(
            CASE
              WHEN o.amount_brl_minor IS NOT NULL THEN o.amount_brl_minor
              WHEN o.currency = 'BRL' THEN o.amount_minor
              WHEN rc.rate IS NOT NULL THEN (o.amount_minor * rc.rate)::bigint
              ELSE 0
            END
          ) FILTER (
            WHERE o.refunded_at >= ${from} AND o.refunded_at < ${to}
          ), 0)::text AS refunded_revenue_brl_minor,
          count(*) FILTER (
            WHERE o.chargeback_at >= ${from} AND o.chargeback_at < ${to}
          )::int AS chargeback_orders,
          COALESCE(sum(
            CASE
              WHEN o.amount_brl_minor IS NOT NULL THEN o.amount_brl_minor
              WHEN o.currency = 'BRL' THEN o.amount_minor
              WHEN rc.rate IS NOT NULL THEN (o.amount_minor * rc.rate)::bigint
              ELSE 0
            END
          ) FILTER (
            WHERE o.chargeback_at >= ${from} AND o.chargeback_at < ${to}
          ), 0)::text AS chargeback_revenue_brl_minor
        FROM tracking_orders o
        JOIN tracking_projects project ON project.id = o.project_id
        LEFT JOIN exchange_rate_cache rc
          ON rc.base_currency = o.currency AND rc.target_currency = 'BRL'
        LEFT JOIN exchange_rate_cache usd
          ON usd.base_currency = 'USD' AND usd.target_currency = 'BRL'
        WHERE project.offer_id = ${req.params.id}
          AND (
            (o.occurred_at >= ${from} AND o.occurred_at < ${to})
            OR (o.paid_at >= ${from} AND o.paid_at < ${to})
            OR (o.refunded_at >= ${from} AND o.refunded_at < ${to})
            OR (o.chargeback_at >= ${from} AND o.chargeback_at < ${to})
            OR (
              o.status = 'cancelled'
              AND COALESCE(o.cancelled_at, o.updated_at) >= ${from}
              AND COALESCE(o.cancelled_at, o.updated_at) < ${to}
            )
          )
        GROUP BY o.project_id
      ),
      receipt_stats AS (
        SELECT
          v.project_id,
          count(*)::int AS webhooks_received,
          count(*) FILTER (WHERE r.state = 'quarantined')::int AS webhooks_quarantined
        FROM webhook_receipts r
        JOIN vendepay_connections v ON v.id = r.connection_id
        JOIN tracking_projects project ON project.id = v.project_id
        WHERE project.offer_id = ${req.params.id}
          AND r.received_at >= ${from} AND r.received_at < ${to}
        GROUP BY v.project_id
      ),
      delivery_stats AS (
        SELECT
          d.project_id,
          count(*)::int AS utmify_deliveries_attempted,
          count(*) FILTER (WHERE d.state = 'dead')::int AS utmify_deliveries_lost
        FROM tracking_delivery_outbox d
        JOIN tracking_projects project ON project.id = d.project_id
        WHERE project.offer_id = ${req.params.id}
          AND d.destination_kind = 'utmify'
          AND d.created_at >= ${from} AND d.created_at < ${to}
        GROUP BY d.project_id
      )
      SELECT
        COALESCE(e.events, 0)::int AS events,
        COALESCE(e.visitors, 0)::int AS visitors,
        COALESCE(e.page_views, 0)::int AS page_views,
        COALESCE(e.ad_clicks, 0)::int AS ad_clicks,
        COALESCE(e.connected_clicks, 0)::int AS connected_clicks,
        COALESCE(e.checkouts, 0)::int AS checkouts,
        COALESCE(e.checkout_events, 0)::int AS checkout_events,
        COALESCE(o.orders, 0)::int AS orders,
        COALESCE(o.paid_orders, 0)::int AS paid_orders,
        COALESCE(o.failed_orders, 0)::int AS failed_orders,
        COALESCE(o.paid_buyers, 0)::int AS paid_buyers,
        COALESCE(o.upsell_orders, 0)::int AS upsell_orders,
        COALESCE(o.upsell_2_orders, 0)::int AS upsell_2_orders,
        COALESCE(o.upsell_3_orders, 0)::int AS upsell_3_orders,
        COALESCE(o.unmapped_paid_orders, 0)::int AS unmapped_paid_orders,
        COALESCE(o.orphan_orders, 0)::int AS orphan_orders,
        COALESCE(o.paid_revenue_minor, '0') AS paid_revenue_minor,
        COALESCE(o.paid_revenue_brl_minor, '0') AS paid_revenue_brl_minor,
        COALESCE(o.paid_revenue_usd_minor, '0') AS paid_revenue_usd_minor,
        COALESCE(o.unconverted_paid_orders, 0)::int AS unconverted_paid_orders,
        COALESCE(o.refunded_orders, 0)::int AS refunded_orders,
        COALESCE(o.refunded_revenue_brl_minor, '0') AS refunded_revenue_brl_minor,
        COALESCE(o.chargeback_orders, 0)::int AS chargeback_orders,
        COALESCE(o.chargeback_revenue_brl_minor, '0') AS chargeback_revenue_brl_minor,
        COALESCE(r.webhooks_received, 0)::int AS webhooks_received,
        COALESCE(r.webhooks_quarantined, 0)::int AS webhooks_quarantined,
        COALESCE(d.utmify_deliveries_attempted, 0)::int AS utmify_deliveries_attempted,
        COALESCE(d.utmify_deliveries_lost, 0)::int AS utmify_deliveries_lost
      FROM tracking_projects p
      LEFT JOIN event_stats e ON e.project_id = p.id
      LEFT JOIN order_stats o ON o.project_id = p.id
      LEFT JOIN receipt_stats r ON r.project_id = p.id
      LEFT JOIN delivery_stats d ON d.project_id = p.id
      WHERE p.offer_id = ${req.params.id}
    `;
  return summary;
}
