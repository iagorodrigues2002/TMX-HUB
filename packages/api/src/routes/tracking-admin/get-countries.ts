import type { FastifyInstance } from 'fastify';
import { countryActivity } from '../../services/country-activity.js';
import { funnelActivity } from '../../services/funnel-activity.js';
import {
  type TrackingPeriodQuery,
  databaseUnavailable,
  parseTrackingDate,
} from './pagination-schema.js';

export function registerGetCountriesRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string }; Querystring: TrackingPeriodQuery }>(
    '/offers/:id/tracking/funnel-activity',
    async (req, reply) => {
      await app.offerStore.assertAccess(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db) return reply.code(503).send(databaseUnavailable);
      const { from, to } = parseTrackingDate(req.query);
      return funnelActivity(app.db, req.params.id, new Date(from), new Date(to));
    },
  );
  app.get<{ Params: { id: string }; Querystring: TrackingPeriodQuery }>(
    '/offers/:id/tracking/country-activity',
    async (req, reply) => {
      await app.offerStore.assertAccess(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db) return reply.code(503).send(databaseUnavailable);
      const { from, to } = parseTrackingDate(req.query);
      return countryActivity(app.db, req.params.id, new Date(from), new Date(to));
    },
  );
  app.get<{ Params: { id: string }; Querystring: TrackingPeriodQuery }>(
    '/offers/:id/tracking/countries',
    async (req, reply) => {
      await app.offerStore.assertAccess(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db) return reply.code(503).send(databaseUnavailable);
      const { date, from_date: fromDate, to_date: toDate, from, to } = parseTrackingDate(req.query);
      return app.analyticsCache.getOrSet(
        {
          endpoint: 'tracking-countries',
          offerId: req.params.id,
          from: fromDate,
          to: toDate,
          ttlSeconds: 60,
        },
        async () => {
          const rows = await app.db!`
        WITH event_counts AS (
          SELECT
            CASE
              WHEN upper(e.source->>'country') ~ '^[A-Z]{2}$' THEN upper(e.source->>'country')
              ELSE 'ZZ'
            END AS country,
            count(*) FILTER (WHERE e.event_name = 'PageView')::int AS page_views,
            count(*) FILTER (WHERE e.event_name = 'InitiateCheckout')::int AS checkouts
          FROM tracking_events e
          JOIN tracking_projects p ON p.id = e.project_id
          WHERE p.offer_id = ${req.params.id}
            AND e.received_at >= ${from} AND e.received_at < ${to}
            AND e.event_name IN ('AdClick', 'PageView', 'InitiateCheckout')
          GROUP BY 1
        ),
        order_counts AS (
          SELECT
            CASE
              WHEN upper(COALESCE(
                NULLIF(o.buyer->>'country', ''),
                NULLIF(o.attribution_source->>'country', ''),
                latest_event.source->>'country'
              )) ~ '^[A-Z]{2}$'
                THEN upper(COALESCE(
                  NULLIF(o.buyer->>'country', ''),
                  NULLIF(o.attribution_source->>'country', ''),
                  latest_event.source->>'country'
                ))
              ELSE 'ZZ'
            END AS country,
            count(*)::int AS orders,
            count(*) FILTER (WHERE o.status = 'paid')::int AS paid_orders,
            count(DISTINCT COALESCE(
              NULLIF(lower(trim(o.buyer->>'email')), ''),
              NULLIF(regexp_replace(o.buyer->>'phone', '\D', '', 'g'), ''),
              NULLIF(trim(o.visitor_id), ''),
              o.external_id
            )) FILTER (WHERE o.status = 'paid' AND o.order_kind = 'front')::int
              AS front_buyers,
            COALESCE(sum(o.amount_minor) FILTER (WHERE o.status = 'paid'), 0)::text
              AS paid_revenue_minor,
            COALESCE(sum(o.amount_brl_minor) FILTER (WHERE o.status = 'paid'), 0)::text
              AS paid_revenue_brl_minor,
            COALESCE(
              round(
                COALESCE(sum(o.amount_brl_minor) FILTER (WHERE o.status = 'paid'), 0)::numeric /
                NULLIF(count(DISTINCT COALESCE(
                  NULLIF(lower(trim(o.buyer->>'email')), ''),
                  NULLIF(regexp_replace(o.buyer->>'phone', '\D', '', 'g'), ''),
                  NULLIF(trim(o.visitor_id), ''),
                  o.external_id
                )) FILTER (WHERE o.status = 'paid' AND o.order_kind = 'front'), 0)
              ),
              0
            )::bigint::text AS aov_brl_minor
          FROM tracking_orders o
          JOIN tracking_projects p ON p.id = o.project_id
          LEFT JOIN LATERAL (
            SELECT e.source
            FROM tracking_events e
            WHERE e.project_id = o.project_id AND e.visitor_id = o.visitor_id
              AND e.received_at <= COALESCE(o.paid_at, o.occurred_at)
              AND e.received_at >= COALESCE(o.paid_at, o.occurred_at) - interval '30 days'
              AND e.event_name IN ('AdClick','PageView','InitiateCheckout')
              AND upper(e.source->>'country') ~ '^[A-Z]{2}$'
            ORDER BY e.received_at ASC, e.id ASC
            LIMIT 1
          ) latest_event ON true
          WHERE p.offer_id = ${req.params.id}
            AND o.occurred_at >= ${from} AND o.occurred_at < ${to}
          GROUP BY 1
        )
        SELECT
          COALESCE(e.country, o.country) AS country,
          COALESCE(e.page_views, 0)::int AS page_views,
          COALESCE(e.checkouts, 0)::int AS checkouts,
          COALESCE(o.orders, 0)::int AS orders,
          COALESCE(o.paid_orders, 0)::int AS paid_orders,
          COALESCE(o.front_buyers, 0)::int AS front_buyers,
          COALESCE(o.paid_revenue_minor, '0') AS paid_revenue_minor,
          COALESCE(o.paid_revenue_brl_minor, '0') AS paid_revenue_brl_minor,
          COALESCE(o.aov_brl_minor, '0') AS aov_brl_minor
        FROM event_counts e
        FULL OUTER JOIN order_counts o ON o.country = e.country
        ORDER BY page_views DESC, checkouts DESC, paid_orders DESC
          `;
          return { date, time_zone: 'America/Sao_Paulo', rows };
        },
      );
    },
  );
}
