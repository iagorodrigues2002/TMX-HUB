import type { FastifyInstance } from 'fastify';
import { ulid } from 'ulid';
import { NotFoundError } from '../../lib/problem.js';
import {
  type TrackingPeriodQuery,
  databaseUnavailable,
  parseTrackingDate,
} from './pagination-schema.js';

export function registerPostInitiateCheckoutReconcileRoutes(app: FastifyInstance) {
  app.post<{ Params: { id: string }; Querystring: TrackingPeriodQuery }>(
    '/offers/:id/tracking/initiate-checkout/reconcile',
    async (req, reply) => {
      await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db) return reply.code(503).send(databaseUnavailable);
      const { date, from, to } = parseTrackingDate(req.query);
      const [project] = await app.db<{ id: string; utmify_pixel_id: string | null }[]>`
        SELECT id, utmify_pixel_id FROM tracking_projects
        WHERE offer_id = ${req.params.id} AND enabled = true
      `;
      if (!project) throw new NotFoundError('Projeto de tracking não encontrado.');

      const result = await app.db.begin(async (sql) => {
        const recovered = await sql<{ id: string }[]>`
          WITH matches AS (
            SELECT
              checkout.id,
              page.visitor_id,
              page.journey_id,
              page.source,
              page.event_url
            FROM tracking_events checkout
            JOIN LATERAL (
              SELECT candidate.visitor_id, candidate.journey_id, candidate.source,
                     candidate.event_url
              FROM tracking_events candidate
              WHERE candidate.project_id = checkout.project_id
                AND candidate.event_name = 'PageView'
                AND (
                  candidate.visitor_id = checkout.visitor_id
                  OR (
                    candidate.client_ip = checkout.client_ip
                    AND candidate.user_agent = checkout.user_agent
                  )
                )
                AND candidate.received_at <= checkout.received_at
                AND candidate.received_at >= checkout.received_at - interval '24 hours'
                AND (
                  NULLIF(candidate.source->>'campaign_id', '') IS NOT NULL
                  OR NULLIF(candidate.source->>'campaign_name', '') IS NOT NULL
                  OR NULLIF(candidate.source->>'utm_campaign', '') IS NOT NULL
                  OR NULLIF(candidate.source->>'adset_id', '') IS NOT NULL
                  OR NULLIF(candidate.source->>'ad_id', '') IS NOT NULL
                )
              ORDER BY
                (candidate.visitor_id = checkout.visitor_id) DESC,
                candidate.received_at DESC,
                candidate.id DESC
              LIMIT 1
            ) page ON true
            WHERE checkout.project_id = ${project.id}
              AND checkout.event_name = 'InitiateCheckout'
              AND checkout.received_at >= ${from}
              AND checkout.received_at < ${to}
          )
          UPDATE tracking_events checkout
          SET visitor_id = matches.visitor_id,
              journey_id = COALESCE(matches.journey_id, checkout.journey_id),
              source = matches.source || checkout.source,
              event_url = CASE
                WHEN checkout.event_url ~ '^https?://([^/]+\\.)?(theminex\\.com|page-clonerapi-production\\.up\\.railway\\.app)/v1/(r|link)/'
                  THEN matches.event_url
                ELSE checkout.event_url
              END,
              properties = checkout.properties ||
                '{"attribution_recovered":"pageview_ip_ua_enrichment"}'::jsonb
          FROM matches
          WHERE checkout.project_id = ${project.id}
            AND checkout.id = matches.id
            AND (
              checkout.visitor_id IS DISTINCT FROM matches.visitor_id
              OR checkout.journey_id IS DISTINCT FROM COALESCE(matches.journey_id, checkout.journey_id)
              OR checkout.source IS DISTINCT FROM matches.source || checkout.source
              OR (
                checkout.event_url ~ '^https?://([^/]+\\.)?(theminex\\.com|page-clonerapi-production\\.up\\.railway\\.app)/v1/(r|link)/'
                AND checkout.event_url IS DISTINCT FROM matches.event_url
              )
            )
          RETURNING checkout.id
        `;
        const events = await sql<{ id: string; received_at: Date }[]>`
          SELECT id, received_at
          FROM tracking_events
          WHERE project_id = ${project.id}
            AND event_name = 'InitiateCheckout'
            AND received_at >= ${from}
            AND received_at < ${to}
          ORDER BY received_at ASC
        `;
        const pixels = await sql<{ id: string }[]>`
          SELECT id FROM meta_pixels
          WHERE project_id = ${project.id} AND enabled = true
          ORDER BY created_at ASC
        `;
        const meta: Array<{ id: string }> = [];
        const utmifyWebEvents: Array<{ id: string }> = [];
        for (const event of events) {
          for (const pixel of pixels) {
            const rows = await sql<{ id: string }[]>`
              INSERT INTO meta_deliveries AS existing
                (id, project_id, pixel_id, order_id, event_id, event_name, event_at,
                 outgoing_event_id)
              VALUES
                (${ulid()}, ${project.id}, ${pixel.id}, NULL, ${event.id},
                 'InitiateCheckout', ${event.received_at}, NULL)
              ON CONFLICT (pixel_id, event_id) DO UPDATE SET
                state = 'pending',
                attempts = 0,
                last_error = NULL
              WHERE existing.state <> 'delivered'
              RETURNING id
            `;
            if (rows[0]) meta.push(rows[0]);
          }
          if (project.utmify_pixel_id) {
            const utmifyRows = await sql<{ id: string }[]>`
                INSERT INTO tracking_utmify_web_events AS existing
                  (id, project_id, pixel_id, external_pixel_id, event_id, event_name)
                VALUES
                  (${ulid()}, ${project.id}, NULL, ${project.utmify_pixel_id},
                   ${event.id}, 'InitiateCheckout')
                ON CONFLICT (project_id, external_pixel_id, event_id) DO UPDATE SET
                  external_pixel_id = EXCLUDED.external_pixel_id,
                  state = 'pending',
                  attempts = 0,
                  last_error = NULL,
                  next_attempt_at = now()
                WHERE existing.state <> 'delivered'
                   OR existing.external_pixel_id <> EXCLUDED.external_pixel_id
                RETURNING id
              `;
            if (utmifyRows[0]) utmifyWebEvents.push(utmifyRows[0]);
          }
        }
        // IC is an analytics event, not an order. Neutralize legacy records that
        // were incorrectly sent to UTMify as waiting_payment.
        const utmify = await sql<{ id: string }[]>`
          UPDATE tracking_delivery_outbox
          SET event_type = 'event.initiate_checkout.neutralize',
              state = 'pending',
              attempts = 0,
              last_error = NULL,
              next_attempt_at = now()
          WHERE project_id = ${project.id}
            AND destination_kind = 'utmify'
            AND event_type IN (
              'event.initiate_checkout',
              'event.initiate_checkout.neutralize'
            )
            AND state <> 'delivered'
            AND event_id IN (
              SELECT id FROM tracking_events
              WHERE project_id = ${project.id}
                AND event_name = 'InitiateCheckout'
                AND received_at >= ${from}
                AND received_at < ${to}
            )
          RETURNING id
        `;
        return {
          attributionRecovered: recovered.length,
          eventsFound: events.length,
          pixelCount: pixels.length,
          meta,
          utmify,
          utmifyWebEvents,
        };
      });

      await Promise.allSettled([
        ...result.meta.map(({ id }) => app.metaQueue.add('send', { deliveryId: id })),
        ...result.utmifyWebEvents.map(({ id }) =>
          app.utmifyWebEventQueue.add(
            'send',
            { deliveryId: id },
            { jobId: `${id}-manual-${Date.now()}` },
          ),
        ),
        ...result.utmify.map(({ id }) =>
          app.utmifyDeliveryQueue.add(
            'send',
            { deliveryId: id },
            { jobId: `${id}-manual-${Date.now()}` },
          ),
        ),
      ]);
      return reply.code(202).send({
        date,
        attribution_recovered: result.attributionRecovered,
        events_found: result.eventsFound,
        pixels_enabled: result.pixelCount,
        utmify_destinations_enabled: project.utmify_pixel_id ? 1 : 0,
        meta_queued: result.meta.length,
        utmify_queued: result.utmifyWebEvents.length,
        utmify_legacy_neutralized: result.utmify.length,
      });
    },
  );
}
