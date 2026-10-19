import type { FastifyInstance } from 'fastify';
import { ulid } from 'ulid';
import { env } from '../../env.js';
import { encryptSecret } from '../../lib/secret-box.js';
import { assertUtmifyHost } from '../../lib/utmify-hosts.js';
import { DestinationEnabledSchema, DestinationSchema } from './destination-schema.js';

export function registerGetUtmifyDestinationRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>(
    '/offers/:id/tracking/utmify-destination',
    async (req, reply) => {
      await app.offerStore.assertAccess(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db) return reply.code(503).send({ configured: false });
      const [destination] = await app.db`
        SELECT u.id, u.name, u.endpoint_url, u.enabled, u.created_at, u.updated_at
        FROM tracking_utmify_destinations u
        JOIN tracking_projects p ON p.id = u.project_id
        WHERE p.offer_id = ${req.params.id} AND u.scope='offer'
      `;
      return { configured: Boolean(destination), destination: destination ?? null };
    },
  );

  app.put<{ Params: { id: string } }>(
    '/offers/:id/tracking/utmify-destination',
    async (req, reply) => {
      await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db || !env.TRACKING_ENCRYPTION_KEY) {
        return reply.code(503).send({ error: 'tracking_encryption_unavailable' });
      }
      const parsed = DestinationSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: 'invalid_utmify_destination' });
      try {
        assertUtmifyHost(parsed.data.endpoint_url);
      } catch {
        return reply.code(400).send({
          error: 'utmify_host_not_allowed',
          message: 'A URL deve usar um host oficial da UTMify.',
        });
      }
      const [project] = await app.db<{ id: string }[]>`
        SELECT id FROM tracking_projects
        WHERE offer_id = ${req.params.id} AND enabled = true
      `;
      if (!project) return reply.code(409).send({ error: 'tracking_not_configured' });
      const [destination] = await app.db`
        INSERT INTO tracking_utmify_destinations
          (id, project_id, name, api_token_encrypted, endpoint_url)
        VALUES
          (${ulid()}, ${project.id}, ${parsed.data.name},
           ${encryptSecret(parsed.data.api_token, env.TRACKING_ENCRYPTION_KEY)},
           ${parsed.data.endpoint_url})
        ON CONFLICT (project_id) WHERE scope='offer' DO UPDATE SET
          name = EXCLUDED.name,
          api_token_encrypted = EXCLUDED.api_token_encrypted,
          endpoint_url = EXCLUDED.endpoint_url,
          enabled = true,
          updated_at = now()
        RETURNING id, name, endpoint_url, enabled, created_at, updated_at
      `;
      return reply.code(201).send({ destination });
    },
  );

  app.patch<{ Params: { id: string } }>(
    '/offers/:id/tracking/utmify-destination',
    async (req, reply) => {
      await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db) return reply.code(503).send({ error: 'database_unavailable' });
      const parsed = DestinationEnabledSchema.safeParse(req.body);
      if (!parsed.success)
        return reply.code(400).send({ error: 'invalid_utmify_destination_status' });
      const [destination] = await app.db`
        UPDATE tracking_utmify_destinations u
        SET enabled=${parsed.data.enabled}, updated_at=now()
        FROM tracking_projects p
        WHERE u.project_id=p.id AND p.offer_id=${req.params.id} AND u.scope='offer'
        RETURNING u.id,u.name,u.endpoint_url,u.enabled,u.updated_at
      `;
      if (!destination) return reply.code(404).send({ error: 'utmify_destination_not_found' });
      return { destination };
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/offers/:id/tracking/utmify-destination',
    async (req, reply) => {
      await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db) return reply.code(503).send();
      await app.db`
        UPDATE tracking_utmify_destinations u SET enabled = false, updated_at = now()
        FROM tracking_projects p
        WHERE u.project_id = p.id AND p.offer_id = ${req.params.id} AND u.scope='offer'
      `;
      return reply.code(204).send();
    },
  );

  app.get<{ Params: { id: string } }>(
    '/offers/:id/tracking/utmify-deliveries',
    async (req, reply) => {
      await app.offerStore.assertAccess(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db) return reply.code(503).send({ deliveries: [] });
      const deliveries = await app.db`
        SELECT d.id, d.event_id, d.event_type, d.state, d.attempts,
               d.response_status, d.response, d.last_error, d.created_at, d.delivered_at,
               COALESCE(o.external_id, 'TMX-IC-' || d.event_id) AS transaction_id,
               COALESCE(o.status, 'pending') AS order_status
        FROM tracking_delivery_outbox d
        JOIN tracking_utmify_destinations u ON u.id=d.destination_id AND u.scope='offer'
        JOIN tracking_projects p ON p.id = d.project_id
        LEFT JOIN tracking_orders o ON o.id = d.order_id
        WHERE p.offer_id = ${req.params.id} AND d.destination_kind = 'utmify'
        ORDER BY d.created_at DESC
        LIMIT 100
      `;
      return { deliveries };
    },
  );

  app.post<{ Params: { id: string; deliveryId: string } }>(
    '/offers/:id/tracking/utmify-deliveries/:deliveryId/retry',
    async (req, reply) => {
      await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db) return reply.code(503).send();
      const [delivery] = await app.db<{ id: string }[]>`
        UPDATE tracking_delivery_outbox d
        SET state = 'pending', last_error = NULL, next_attempt_at = now()
        FROM tracking_projects p
        WHERE d.id = ${req.params.deliveryId}
          AND d.project_id = p.id
          AND p.offer_id = ${req.params.id}
          AND d.destination_kind = 'utmify'
          AND d.state <> 'delivered'
        RETURNING d.id
      `;
      if (!delivery) return reply.code(404).send({ error: 'delivery_not_found' });
      await app.utmifyDeliveryQueue.add('send', { deliveryId: delivery.id });
      return reply.code(202).send({ accepted: true });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/offers/:id/tracking/utmify-front/reconcile',
    async (req, reply) => {
      await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db) return reply.code(503).send({ error: 'database_unavailable' });

      const [project] = await app.db<{ id: string }[]>`
        SELECT id FROM tracking_projects
        WHERE offer_id=${req.params.id} AND enabled=true
        LIMIT 1
      `;
      if (!project) return reply.code(409).send({ error: 'tracking_not_configured' });

      const result = await app.db.begin(async (sql) => {
        const repaired = await sql<{ id: string; complete: boolean }[]>`
          WITH attributed AS (
            SELECT o.id,
              COALESCE(v.first_source, '{}'::jsonb) ||
              COALESCE(v.last_source, '{}'::jsonb) ||
              COALESCE(best.source, '{}'::jsonb) AS recovered
            FROM tracking_orders o
            LEFT JOIN tracking_visitors v
              ON v.project_id=o.project_id AND v.visitor_id=o.visitor_id
            LEFT JOIN LATERAL (
              SELECT te.source
              FROM tracking_events te
              WHERE te.project_id=o.project_id AND te.visitor_id=o.visitor_id
                AND te.received_at <= o.occurred_at + interval '1 day'
              ORDER BY
                ((NULLIF(te.source->>'campaign_id','') IS NOT NULL)::int +
                 (NULLIF(te.source->>'adset_id','') IS NOT NULL)::int +
                 (NULLIF(te.source->>'ad_id','') IS NOT NULL)::int +
                 (NULLIF(te.source->>'utm_campaign','') IS NOT NULL)::int +
                 (NULLIF(te.source->>'utm_content','') IS NOT NULL)::int) DESC,
                te.received_at DESC
              LIMIT 1
            ) best ON true
            WHERE o.project_id=${project.id} AND o.status='paid' AND o.order_kind='front'
              AND o.attribution_locked_at IS NULL
          )
          UPDATE tracking_orders o
          SET attribution_source=o.attribution_source || attributed.recovered, updated_at=now()
          FROM attributed
          WHERE o.id=attributed.id
          RETURNING o.id,
            NULLIF(o.attribution_source->>'campaign_id','') IS NOT NULL
            AND NULLIF(o.attribution_source->>'adset_id','') IS NOT NULL
            AND NULLIF(o.attribution_source->>'ad_id','') IS NOT NULL AS complete
        `;
        const orderIds = repaired.map(({ id }) => id);
        const resetDeliveries = orderIds.length
          ? await sql<{ id: string }[]>`
          UPDATE tracking_delivery_outbox d
          SET state='pending', last_error=NULL, next_attempt_at=now(), delivered_at=NULL
          FROM tracking_utmify_destinations u
          WHERE d.destination_id=u.id AND u.scope='offer'
            AND d.project_id=${project.id} AND d.destination_kind='utmify'
            AND d.order_id IN ${sql(orderIds)} AND d.event_type='order.paid'
          RETURNING d.id
        `
          : [];
        const deliveries = resetDeliveries.length
          ? await sql<{ id: string }[]>`
          SELECT d.id
          FROM tracking_delivery_outbox d
          JOIN tracking_orders o ON o.id=d.order_id
          WHERE d.id IN ${sql(resetDeliveries.map(({ id }) => id))}
          ORDER BY COALESCE(o.paid_at, o.occurred_at) DESC
        `
          : [];
        return { repaired, deliveries };
      });

      await Promise.allSettled(
        result.deliveries.map(({ id }) =>
          app.utmifyDeliveryQueue.add(
            'send',
            { deliveryId: id },
            {
              jobId: `${id}-front-${Date.now()}`,
              // Live/reconciled offer sales must not sit behind a months-long
              // global backfill. BullMQ processes priority jobs first; the
              // per-worker limiter still protects UTMify from bursts.
              priority: 1,
            },
          ),
        ),
      );
      return reply.code(202).send({
        front_orders_scanned: result.repaired.length,
        fully_attributed: result.repaired.filter(({ complete }) => complete).length,
        utmify_queued: result.deliveries.length,
      });
    },
  );
}
