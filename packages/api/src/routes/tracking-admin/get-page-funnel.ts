import type { FastifyInstance } from 'fastify';
import {
  type PaginationQuery,
  type TrackingPeriodQuery,
  databaseUnavailable,
  pagination,
  parsePagination,
  parseTrackingDate,
} from './pagination-schema.js';

export function registerGetPageFunnelRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string }; Querystring: TrackingPeriodQuery }>(
    '/offers/:id/tracking/page-funnel',
    async (req, reply) => {
      await app.offerStore.assertAccess(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db) return reply.code(503).send(databaseUnavailable);
      const { date, from, to } = parseTrackingDate(req.query);
      const pages = await app.db`
        WITH pageviews AS (
          SELECT
            e.visitor_id,
            COALESCE(e.journey_id, e.visitor_id) AS journey_key,
            regexp_replace(e.event_url, '\\?.*$', '') AS page_url,
            COALESCE(NULLIF(e.page_title, ''), regexp_replace(e.event_url, '^https?://', '')) AS page_title,
            e.received_at,
            row_number() OVER (
              PARTITION BY COALESCE(e.journey_id, e.visitor_id)
              ORDER BY e.received_at DESC, e.id DESC
            ) AS reverse_position
          FROM tracking_events e
          JOIN tracking_projects p ON p.id = e.project_id
          WHERE p.offer_id = ${req.params.id} AND e.event_name = 'PageView'
            AND e.received_at >= ${from} AND e.received_at < ${to}
        )
        SELECT
          page_url,
          max(page_title) AS page_title,
          count(*)::int AS views,
          count(DISTINCT visitor_id)::int AS visitors,
          count(*) FILTER (WHERE reverse_position = 1)::int AS exits
        FROM pageviews
        GROUP BY page_url
        ORDER BY visitors DESC, views DESC
        LIMIT 100
      `;
      return { date, time_zone: 'America/Sao_Paulo', pages };
    },
  );

  app.get<{ Params: { id: string }; Querystring: TrackingPeriodQuery }>(
    '/offers/:id/tracking/journeys',
    async (req, reply) => {
      await app.offerStore.assertAccess(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db) return reply.code(503).send(databaseUnavailable);
      const { date, from, to } = parseTrackingDate(req.query);
      const journeys = await app.db`
        WITH project AS (
          SELECT id FROM tracking_projects WHERE offer_id = ${req.params.id}
        ),
        recent AS (
          SELECT
            e.visitor_id,
            COALESCE(e.journey_id, e.visitor_id) AS journey_key,
            max(e.received_at) AS last_seen_at
          FROM tracking_events e
          WHERE e.project_id = (SELECT id FROM project)
            AND e.received_at >= ${from} AND e.received_at < ${to}
          GROUP BY e.visitor_id, COALESCE(e.journey_id, e.visitor_id)
          ORDER BY last_seen_at DESC
          LIMIT 50
        )
        SELECT
          r.visitor_id,
          r.journey_key AS journey_id,
          r.last_seen_at,
          COALESCE((
            SELECT json_agg(json_build_object(
              'id', e.id,
              'title', COALESCE(NULLIF(e.page_title, ''), regexp_replace(e.event_url, '^https?://', '')),
              'url', e.event_url,
              'referrer', e.referrer,
              'visited_at', e.received_at
            ) ORDER BY e.received_at, e.id)
            FROM tracking_events e
            WHERE e.project_id = (SELECT id FROM project)
              AND e.visitor_id = r.visitor_id
              AND COALESCE(e.journey_id, e.visitor_id) = r.journey_key
              AND e.event_name = 'PageView'
              AND e.received_at >= ${from} AND e.received_at < ${to}
          ), '[]'::json) AS pages,
          COALESCE((
            SELECT array_agg(DISTINCT e.event_name)
            FROM tracking_events e
            WHERE e.project_id = (SELECT id FROM project)
              AND e.visitor_id = r.visitor_id
              AND COALESCE(e.journey_id, e.visitor_id) = r.journey_key
              AND e.event_name <> 'PageView'
              AND e.received_at >= ${from} AND e.received_at < ${to}
          ), ARRAY[]::text[]) AS events,
          latest_order.external_id AS order_id,
          latest_order.status AS order_status,
          latest_order.buyer
        FROM recent r
        LEFT JOIN LATERAL (
          SELECT o.external_id, o.status, o.buyer
          FROM tracking_orders o
          WHERE o.project_id = (SELECT id FROM project)
            AND o.visitor_id = r.visitor_id
            AND o.occurred_at >= ${from} AND o.occurred_at < ${to}
          ORDER BY o.occurred_at DESC
          LIMIT 1
        ) latest_order ON true
        ORDER BY r.last_seen_at DESC
      `;
      return { date, time_zone: 'America/Sao_Paulo', journeys };
    },
  );

  app.get<{ Params: { id: string }; Querystring: PaginationQuery }>(
    '/offers/:id/tracking/orders',
    async (req, reply) => {
      await app.offerStore.assertAccess(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db) return reply.code(503).send(databaseUnavailable);
      const { page, per_page: perPage, offset } = parsePagination(req.query);
      const { date, from, to } = parseTrackingDate(req.query);

      const [items, totals] = await Promise.all([
        app.db`
          SELECT o.id, o.provider, o.external_id, o.status, o.amount_minor,
                 o.currency, o.visitor_id, o.buyer, o.raw_status,
                 o.occurred_at, o.updated_at
          FROM tracking_orders o
          JOIN tracking_projects p ON p.id = o.project_id
          WHERE p.offer_id = ${req.params.id}
            AND o.occurred_at >= ${from} AND o.occurred_at < ${to}
          ORDER BY o.occurred_at DESC, o.id DESC
          LIMIT ${perPage} OFFSET ${offset}
        `,
        app.db<{ total: number }[]>`
          SELECT count(*)::int AS total
          FROM tracking_orders o
          JOIN tracking_projects p ON p.id = o.project_id
          WHERE p.offer_id = ${req.params.id}
            AND o.occurred_at >= ${from} AND o.occurred_at < ${to}
        `,
      ]);
      const total = totals[0]?.total ?? 0;
      return {
        date,
        time_zone: 'America/Sao_Paulo',
        items,
        pagination: pagination(page, perPage, total),
      };
    },
  );
}
