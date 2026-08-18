import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { ulid } from 'ulid';
import { z } from 'zod';
import { env } from '../env.js';
import { buildPushcutNotificationPayload } from '../integrations/pushcut/notification.js';
import { decryptSecret, encryptSecret } from '../lib/secret-box.js';

const DestinationSchema = z.object({
  name: z.string().trim().min(1).max(80),
  secret: z.string().trim().min(8).max(256),
  front_notification_name: z.string().trim().min(1).max(200),
  upsell_notification_name: z.string().trim().min(1).max(200).nullish(),
  devices: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
});

const databaseUnavailable = {
  error: 'tracking_database_unavailable',
  detail: 'A infraestrutura de tracking está temporariamente indisponível.',
};

const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get<{ Params: { id: string } }>(
    '/offers/:id/tracking/pushcut-destinations',
    async (req, reply) => {
      await app.offerStore.assertAccess(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db) return reply.code(503).send({ destinations: [] });
      const destinations = await app.db`
        SELECT pd.id, pd.name, pd.front_notification_name, pd.upsell_notification_name,
               pd.devices, pd.enabled, pd.created_at, pd.updated_at
        FROM tracking_pushcut_destinations pd
        JOIN tracking_projects tp ON tp.id = pd.project_id
        WHERE tp.offer_id = ${req.params.id}
        ORDER BY pd.created_at DESC
      `;
      return reply.send({ destinations });
    },
  );

  // Creates a new destination. Unlike UTMify/Meta this always inserts a new
  // row rather than upserting by a natural key — the whole point is letting
  // the same offer notify several distinct Pushcut accounts/devices.
  app.post<{ Params: { id: string } }>(
    '/offers/:id/tracking/pushcut-destinations',
    async (req, reply) => {
      await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db || !env.TRACKING_ENCRYPTION_KEY) {
        return reply.code(503).send({ error: 'tracking_encryption_unavailable' });
      }
      const parsed = DestinationSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: 'invalid_pushcut_destination' });
      const [project] = await app.db<{ id: string }[]>`
        SELECT id FROM tracking_projects WHERE offer_id = ${req.params.id} AND enabled = true
      `;
      if (!project) return reply.code(409).send({ error: 'tracking_not_configured' });

      const [destination] = await app.db`
        INSERT INTO tracking_pushcut_destinations
          (id, project_id, name, secret_encrypted, front_notification_name,
           upsell_notification_name, devices)
        VALUES
          (${ulid()}, ${project.id}, ${parsed.data.name},
           ${encryptSecret(parsed.data.secret, env.TRACKING_ENCRYPTION_KEY)},
           ${parsed.data.front_notification_name},
           ${parsed.data.upsell_notification_name ?? null},
           ${app.db.json(parsed.data.devices)})
        RETURNING id, name, front_notification_name, upsell_notification_name,
                  devices, enabled, created_at, updated_at
      `;
      return reply.code(201).send({ destination });
    },
  );

  app.patch<{ Params: { id: string; destinationId: string } }>(
    '/offers/:id/tracking/pushcut-destinations/:destinationId',
    async (req, reply) => {
      await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db) return reply.code(503).send(databaseUnavailable);
      const ToggleSchema = z.object({ enabled: z.boolean() });
      const parsed = ToggleSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: 'invalid_body' });
      const [destination] = await app.db`
        UPDATE tracking_pushcut_destinations pd
        SET enabled = ${parsed.data.enabled}, updated_at = now()
        FROM tracking_projects tp
        WHERE pd.id = ${req.params.destinationId}
          AND pd.project_id = tp.id
          AND tp.offer_id = ${req.params.id}
        RETURNING pd.id, pd.enabled
      `;
      if (!destination) return reply.code(404).send({ error: 'destination_not_found' });
      return reply.send({ destination });
    },
  );

  app.delete<{ Params: { id: string; destinationId: string } }>(
    '/offers/:id/tracking/pushcut-destinations/:destinationId',
    async (req, reply) => {
      await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db) return reply.code(503).send();
      await app.db`
        DELETE FROM tracking_pushcut_destinations pd
        USING tracking_projects tp
        WHERE pd.id = ${req.params.destinationId}
          AND pd.project_id = tp.id
          AND tp.offer_id = ${req.params.id}
      `;
      return reply.code(204).send();
    },
  );

  // Sends a real Pushcut notification right now, bypassing the outbox, so
  // the operator can confirm the secret + notification name are correct
  // without waiting for (or faking) a Vendepay sale.
  app.post<{ Params: { id: string; destinationId: string } }>(
    '/offers/:id/tracking/pushcut-destinations/:destinationId/test',
    async (req, reply) => {
      await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db || !env.TRACKING_ENCRYPTION_KEY) {
        return reply.code(503).send({ error: 'tracking_encryption_unavailable' });
      }
      const [destination] = await app.db<
        Array<{
          secret_encrypted: string;
          front_notification_name: string;
          devices: string[];
        }>
      >`
        SELECT pd.secret_encrypted, pd.front_notification_name, pd.devices
        FROM tracking_pushcut_destinations pd
        JOIN tracking_projects tp ON tp.id = pd.project_id
        WHERE pd.id = ${req.params.destinationId} AND tp.offer_id = ${req.params.id}
      `;
      if (!destination) return reply.code(404).send({ error: 'destination_not_found' });

      const offer = await app.offerStore.maybeGet(req.params.id);
      const payload = buildPushcutNotificationPayload(
        {
          kind: 'front',
          buyerName: 'Cliente Teste TMX',
          productName: 'Checkout de teste',
          amountBrlMinor: 100,
          currency: 'BRL',
          funnelName: offer?.name,
        },
        Array.isArray(destination.devices) ? destination.devices : [],
      );
      const secret = decryptSecret(destination.secret_encrypted, env.TRACKING_ENCRYPTION_KEY);
      const url = `https://api.pushcut.io/${secret}/notifications/${encodeURIComponent(destination.front_notification_name)}`;
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(15_000),
        });
        const text = await response.text();
        const body = (() => {
          if (!text) return null;
          try {
            return JSON.parse(text);
          } catch {
            return { message: text.slice(0, 500) };
          }
        })();
        // Always 200 here: this is a diagnostic action, and Pushcut rejecting
        // the request (bad notification name, wrong secret, ...) is an
        // expected, informative outcome for the admin to see — not a failure
        // of our own API. Returning a non-2xx would make the frontend's
        // generic request() helper throw before it ever reaches the
        // accepted/response handling below, hiding Pushcut's real error
        // message behind a bare "HTTP 502".
        return reply.code(200).send({
          accepted: response.ok,
          status: response.status,
          response: body,
        });
      } catch (error) {
        return reply.code(200).send({
          accepted: false,
          status: null,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  );

  app.get<{ Params: { id: string } }>(
    '/offers/:id/tracking/pushcut-deliveries',
    async (req, reply) => {
      await app.offerStore.assertAccess(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db) return reply.code(503).send({ deliveries: [] });
      const deliveries = await app.db`
        SELECT d.id, d.event_id, d.event_type, d.state, d.attempts,
               d.response_status, d.last_error, d.created_at, d.delivered_at,
               pd.name AS destination_name,
               COALESCE(o.external_id, d.event_id) AS transaction_id,
               COALESCE(o.order_kind, 'unknown') AS order_kind
        FROM tracking_delivery_outbox d
        JOIN tracking_projects p ON p.id = d.project_id
        LEFT JOIN tracking_pushcut_destinations pd ON pd.id = d.destination_id
        LEFT JOIN tracking_orders o ON o.id = d.order_id
        WHERE p.offer_id = ${req.params.id} AND d.destination_kind = 'pushcut'
        ORDER BY d.created_at DESC
        LIMIT 100
      `;
      return reply.send({ deliveries });
    },
  );

  app.post<{ Params: { id: string; deliveryId: string } }>(
    '/offers/:id/tracking/pushcut-deliveries/:deliveryId/retry',
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
          AND d.destination_kind = 'pushcut'
          AND d.state <> 'delivered'
        RETURNING d.id
      `;
      if (!delivery) return reply.code(404).send({ error: 'delivery_not_found' });
      await app.pushcutQueue.add('send', { deliveryId: delivery.id });
      return reply.code(202).send({ accepted: true });
    },
  );

  // Backfills Pushcut notifications for every paid order this offer has
  // ever recorded — for destinations added after sales already happened.
  // Reconstructs the same event_id the live webhook path would have used
  // (vendepay:<external_id>:paid) so the existing UNIQUE(destination_kind,
  // destination_id, event_id) constraint keeps this idempotent: running it
  // twice, or a real webhook re-delivering the same order later, never
  // double-sends.
  app.post<{ Params: { id: string } }>(
    '/offers/:id/tracking/pushcut-destinations/resend-history',
    async (req, reply) => {
      await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db) return reply.code(503).send(databaseUnavailable);
      const [project] = await app.db<{ id: string }[]>`
        SELECT id FROM tracking_projects WHERE offer_id = ${req.params.id} AND enabled = true
      `;
      if (!project) return reply.code(409).send({ error: 'tracking_not_configured' });

      const destinations = await app.db<
        Array<{
          id: string;
          front_notification_name: string;
          upsell_notification_name: string | null;
        }>
      >`
        SELECT id, front_notification_name, upsell_notification_name
        FROM tracking_pushcut_destinations
        WHERE project_id = ${project.id} AND enabled = true
      `;
      if (destinations.length === 0) {
        return reply.code(409).send({ error: 'no_enabled_destinations' });
      }

      const offer = await app.offerStore.maybeGet(req.params.id);
      const funnelName = offer?.name ?? null;

      const orders = await app.db<Array<{ id: string; external_id: string; order_kind: string }>>`
        SELECT id, external_id, order_kind
        FROM tracking_orders
        WHERE project_id = ${project.id} AND status = 'paid'
      `;

      const deliveryIds: string[] = [];
      for (const order of orders) {
        for (const destination of destinations) {
          const notificationName = /^upsell(?:_[2-9][0-9]*)?$/.test(order.order_kind)
            ? destination.upsell_notification_name
            : destination.front_notification_name;
          if (!notificationName) continue;
          const id = ulid();
          const rows = await app.db<{ id: string }[]>`
            INSERT INTO tracking_delivery_outbox
              (id, project_id, destination_kind, destination_id, order_id, event_id, event_type,
               funnel_name)
            VALUES
              (${id}, ${project.id}, 'pushcut', ${destination.id}, ${order.id},
               ${`vendepay:${order.external_id}:paid`}, ${`order.${order.order_kind}`}, ${funnelName})
            ON CONFLICT (destination_kind, destination_id, event_id) DO NOTHING
            RETURNING id
          `;
          if (rows[0]) deliveryIds.push(rows[0].id);
        }
      }
      await Promise.allSettled(
        deliveryIds.map((deliveryId) => app.pushcutQueue.add('send', { deliveryId })),
      );
      return reply.send({
        orders_scanned: orders.length,
        destinations: destinations.length,
        notifications_queued: deliveryIds.length,
      });
    },
  );
};

export default plugin;
