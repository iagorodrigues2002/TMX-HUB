import type { FastifyInstance } from 'fastify';
import { attributionPage } from '../../services/attribution-page.js';
import {
  type PaginationQuery,
  type TrackingPeriodQuery,
  databaseUnavailable,
  pagination,
  parsePagination,
  parseTrackingDate,
} from './pagination-schema.js';

export function registerGetAttributionRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string }; Querystring: TrackingPeriodQuery }>(
    '/offers/:id/tracking/attribution',
    async (req, reply) => {
      await app.offerStore.assertAccess(req.params.id, req.user!.sub, req.user!.role === 'admin');
      const attributionOffer = await app.offerStore.get(req.params.id);
      if (!app.db) return reply.code(503).send(databaseUnavailable);
      const { date, from_date: fromDate, to_date: toDate, from, to } = parseTrackingDate(req.query);
      return app.analyticsCache.getOrSet(
        {
          endpoint: 'tracking-attribution',
          offerId: req.params.id,
          from: fromDate,
          to: toDate,
          ttlSeconds: 60,
        },
        async () => {
          const rows = await app.db!`
        WITH project AS (
          SELECT id FROM tracking_projects WHERE offer_id = ${req.params.id}
        ),
        event_facts AS (
          SELECT
            e.visitor_id,
            e.event_name,
            COALESCE(previous_page.source, '{}'::jsonb) || COALESCE(e.source, '{}'::jsonb)
              AS attribution,
            NULL::text AS order_status,
            NULL::bigint AS amount_minor
          FROM tracking_events e
          LEFT JOIN LATERAL (
            SELECT page.source
            FROM tracking_events page
            WHERE page.project_id = e.project_id
              AND page.visitor_id = e.visitor_id
              AND page.event_name = 'PageView'
              AND page.received_at <= e.received_at
            ORDER BY page.received_at DESC, page.id DESC
            LIMIT 1
          ) previous_page ON e.event_name = 'InitiateCheckout'
          WHERE e.project_id = (SELECT id FROM project)
            AND e.received_at >= ${from} AND e.received_at < ${to}
            AND e.event_name IN ('PageView', 'AdClick', 'InitiateCheckout')
        ),
        order_facts AS (
          SELECT
            o.visitor_id,
            NULL::text AS event_name,
            COALESCE(previous_page.source, '{}'::jsonb) ||
              COALESCE(o.attribution_source, '{}'::jsonb) AS attribution,
            o.status AS order_status,
            o.amount_minor::bigint AS amount_minor
          FROM tracking_orders o
          LEFT JOIN LATERAL (
            SELECT page.source
            FROM tracking_events page
            WHERE page.project_id = o.project_id
              AND page.visitor_id = o.visitor_id
              AND page.event_name = 'PageView'
              AND page.received_at <= o.occurred_at
            ORDER BY page.received_at DESC, page.id DESC
            LIMIT 1
          ) previous_page ON true
          WHERE o.project_id = (SELECT id FROM project)
            AND o.occurred_at >= ${from} AND o.occurred_at < ${to}
        ),
        facts AS (
          SELECT * FROM event_facts
          UNION ALL
          SELECT * FROM order_facts
        ),
        dimensions AS (
          SELECT
            visitor_id,
            event_name,
            order_status,
            amount_minor,
            COALESCE(NULLIF(attribution->>'utm_source', ''),
                     NULLIF(attribution->>'site_source_name', ''),
                     'não identificado') AS source,
            COALESCE(NULLIF(attribution->>'utm_campaign', ''),
                     NULLIF(attribution->>'campaign_name', ''),
                     'não identificada') AS campaign_name,
            NULLIF(attribution->>'campaign_id', '') AS campaign_id,
            COALESCE(NULLIF(attribution->>'utm_term', ''),
                     NULLIF(attribution->>'adset_name', ''),
                     'não identificado') AS adset_name,
            NULLIF(attribution->>'adset_id', '') AS adset_id,
            COALESCE(NULLIF(attribution->>'utm_content', ''),
                     NULLIF(attribution->>'ad_name', ''),
                     'não identificado') AS ad_name,
            NULLIF(attribution->>'ad_id', '') AS ad_id,
            COALESCE(NULLIF(attribution->>'placement', ''), 'não identificado') AS placement,
            jsonb_build_object('pageName',attribution->'pageName','page_name',attribution->'page_name',
              'pageId',attribution->'pageId','page_id',attribution->'page_id') AS page_metadata
          FROM facts
        )
        SELECT
          source,
          campaign_name,
          campaign_id,
          adset_name,
          adset_id,
          ad_name,
          ad_id,
          placement,
          jsonb_agg(DISTINCT page_metadata) AS page_metadata,
          count(*) FILTER (WHERE event_name = 'PageView')::int AS page_views,
          count(DISTINCT visitor_id) FILTER (WHERE event_name = 'PageView')::int AS visitors,
          count(*) FILTER (WHERE event_name = 'AdClick')::int AS ad_clicks,
          count(DISTINCT visitor_id) FILTER (WHERE event_name = 'AdClick')::int
            AS unique_ad_clicks,
          count(*) FILTER (WHERE event_name = 'InitiateCheckout')::int AS checkouts,
          count(DISTINCT visitor_id) FILTER (WHERE event_name = 'InitiateCheckout')::int
            AS unique_checkouts,
          count(*) FILTER (WHERE order_status IS NOT NULL)::int AS orders,
          count(*) FILTER (WHERE order_status = 'paid')::int AS paid_orders,
          count(*) FILTER (WHERE order_status IN ('refused', 'cancelled'))::int
            AS refused_orders,
          COALESCE(sum(amount_minor) FILTER (WHERE order_status = 'paid'), 0)::text
            AS paid_revenue_minor
        FROM dimensions
        GROUP BY source, campaign_name, campaign_id, adset_name, adset_id, ad_name, ad_id, placement
        ORDER BY paid_orders DESC, checkouts DESC, visitors DESC, campaign_name, ad_name
        LIMIT 500
          `;
          const adIds = [
            ...new Set(
              rows
                .map((row) => row.ad_id)
                .filter((id): id is string => typeof id === 'string' && Boolean(id)),
            ),
          ];
          const saved = adIds.length
            ? await app.db!`
            SELECT DISTINCT jsonb_build_object('platform',raw->'platform','adId',raw->'adId',
              'campaignId',raw->'campaignId','adAccountId',raw->'adAccountId',
              'pageName',raw->'pageName','page_name',raw->'page_name','pageId',raw->'pageId','page_id',raw->'page_id',
              'provider_original',jsonb_build_object('pageName',raw->'provider_original'->'pageName',
                'page_name',raw->'provider_original'->'page_name','pageId',raw->'provider_original'->'pageId',
                'page_id',raw->'provider_original'->'page_id')) AS raw FROM ads_intelligence_daily
            WHERE owner_id=${attributionOffer.userId} AND raw->>'platform'='meta'
              AND raw->>'adId'=ANY(${adIds})
            LIMIT 2001
          `
            : [];
          const pageSnapshots = saved.length > 2000 ? [] : saved.map((snapshot) => snapshot.raw);
          return {
            date,
            time_zone: 'America/Sao_Paulo',
            rows: rows.map(({ page_metadata, ...row }) => ({
              ...row,
              ...attributionPage({ ...row, page_metadata }, pageSnapshots),
            })),
          };
        },
      );
    },
  );

  app.get<{ Params: { id: string }; Querystring: PaginationQuery }>(
    '/offers/:id/tracking/orphans',
    async (req, reply) => {
      await app.offerStore.assertAccess(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db) return reply.code(503).send(databaseUnavailable);
      const { page, per_page: perPage, offset } = parsePagination(req.query);

      const [items, totals] = await Promise.all([
        app.db`
          SELECT o.id, o.provider, o.external_id, o.status, o.amount_minor,
                 o.currency, o.buyer, o.raw_status, o.occurred_at, o.updated_at
          FROM tracking_orders o
          JOIN tracking_projects p ON p.id = o.project_id
          WHERE p.offer_id = ${req.params.id}
            AND NULLIF(trim(o.visitor_id), '') IS NULL
          ORDER BY o.occurred_at DESC, o.id DESC
          LIMIT ${perPage} OFFSET ${offset}
        `,
        app.db<{ total: number }[]>`
          SELECT count(*)::int AS total
          FROM tracking_orders o
          JOIN tracking_projects p ON p.id = o.project_id
          WHERE p.offer_id = ${req.params.id}
            AND NULLIF(trim(o.visitor_id), '') IS NULL
        `,
      ]);
      const total = totals[0]?.total ?? 0;
      return { items, pagination: pagination(page, perPage, total) };
    },
  );
}
