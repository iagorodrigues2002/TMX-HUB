import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { ulid } from 'ulid';
import { z } from 'zod';
import { env } from '../env.js';
import { encryptSecret } from '../lib/secret-box.js';

const DestinationSchema = z.object({
  name: z.string().trim().min(1).max(80).default('UTMify'),
  api_token: z.string().trim().min(16).max(4096),
  endpoint_url: z.string().url().default('https://api.utmify.com.br/api-credentials/orders'),
});

const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get<{ Params: { id: string } }>(
    '/offers/:id/tracking/utmify-destination',
    async (req, reply) => {
      await app.offerStore.assertAccess(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db) return reply.code(503).send({ configured: false });
      const [destination] = await app.db`
        SELECT u.id, u.name, u.endpoint_url, u.enabled, u.created_at, u.updated_at
        FROM tracking_utmify_destinations u
        JOIN tracking_projects p ON p.id = u.project_id
        WHERE p.offer_id = ${req.params.id}
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
        ON CONFLICT (project_id) DO UPDATE SET
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

  app.delete<{ Params: { id: string } }>(
    '/offers/:id/tracking/utmify-destination',
    async (req, reply) => {
      await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db) return reply.code(503).send();
      await app.db`
        UPDATE tracking_utmify_destinations u SET enabled = false, updated_at = now()
        FROM tracking_projects p
        WHERE u.project_id = p.id AND p.offer_id = ${req.params.id}
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
               d.response_status, d.last_error, d.created_at, d.delivered_at,
               o.external_id AS transaction_id, o.status AS order_status
        FROM tracking_delivery_outbox d
        JOIN tracking_projects p ON p.id = d.project_id
        JOIN tracking_orders o ON o.id = d.order_id
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
};

export default plugin;
