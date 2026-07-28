import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { ulid } from 'ulid';
import { z } from 'zod';
import { env } from '../env.js';
import { normalizeVendepay } from '../integrations/vendepay/normalize.js';
import { createTrackingToken, readTrackingToken } from '../lib/tracking-token.js';
import { buildTrackerScript } from '../services/tracker-script.js';

const EventSchema = z.object({
  public_key: z.string().min(16).max(128),
  event_id: z.string().min(8).max(128),
  visitor_id: z.string().min(8).max(128),
  session_id: z.string().min(8).max(128).optional(),
  journey_id: z.string().min(8).max(128).optional(),
  event_name: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[A-Za-z][A-Za-z0-9_.:-]*$/),
  event_category: z.string().trim().min(1).max(40).default('behavior'),
  event_url: z.string().url().max(4096),
  page_title: z.string().max(512).optional(),
  referrer: z.string().url().max(4096).optional().or(z.literal('')),
  source: z.record(z.string(), z.string().max(2048)).default({}),
  properties: z.record(z.string(), z.unknown()).default({}),
  consent_state: z.enum(['granted', 'denied', 'unknown']).optional(),
  client_at: z.string().datetime().optional(),
});

const BootstrapSchema = z.object({
  public_key: z.string().min(16).max(128),
  visitor_id: z.string().min(8).max(128),
  session_id: z.string().min(8).max(128),
  journey_id: z.string().min(8).max(128),
  landing_url: z.string().url().max(4096),
  referrer: z.string().url().max(4096).optional().or(z.literal('')),
  source: z.record(z.string(), z.string().max(2048)).default({}),
  tracking_token: z.string().max(2048).optional(),
});

const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get<{ Querystring: { key?: string } }>('/track/t.js', async (req, reply) => {
    if (!req.query.key || !app.db) return reply.code(404).send();
    const [project] = await app.db<{ id: string; enabled: boolean }[]>`
      SELECT id, enabled FROM tracking_projects WHERE public_key = ${req.query.key}
    `;
    if (!project?.enabled) return reply.code(404).send();
    const pixels = await app.db<{ pixel_id: string }[]>`
      SELECT pixel_id FROM meta_pixels
      WHERE project_id = ${project.id} AND enabled = true
    `;
    return reply
      .header('content-type', 'application/javascript; charset=utf-8')
      .header('cache-control', 'public, max-age=300')
      .send(
        buildTrackerScript(
          req.query.key,
          pixels.map((pixel) => pixel.pixel_id),
        ),
      );
  });

  app.post('/track/bootstrap', { bodyLimit: 64 * 1024 }, async (req, reply) => {
    if (!app.db) return reply.code(503).send({ accepted: false });
    const parsed = BootstrapSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ accepted: false });
    const input = parsed.data;
    const [project] = await app.db<{ id: string; enabled: boolean }[]>`
      SELECT id, enabled FROM tracking_projects WHERE public_key = ${input.public_key}
    `;
    if (!project?.enabled) return reply.code(404).send({ accepted: false });
    const linkedIdentity = input.tracking_token
      ? readTrackingToken(input.tracking_token, env.WEBHOOK_SECRET)
      : null;
    const visitorId =
      linkedIdentity?.projectId === project.id ? linkedIdentity.visitorId : input.visitor_id;
    const journeyId =
      linkedIdentity?.projectId === project.id ? linkedIdentity.journeyId : input.journey_id;
    await app.db.begin(async (sql) => {
      await sql`
        INSERT INTO tracking_visitors
          (project_id, visitor_id, first_source, last_source)
        VALUES
          (${project.id}, ${visitorId}, ${sql.json(input.source)}, ${sql.json(input.source)})
        ON CONFLICT (project_id, visitor_id) DO UPDATE SET
          last_source = CASE
            WHEN EXCLUDED.last_source = '{}'::jsonb THEN tracking_visitors.last_source
            ELSE tracking_visitors.last_source || EXCLUDED.last_source
          END,
          last_seen_at = now()
      `;
      await sql`
        INSERT INTO tracking_sessions
          (project_id, session_id, visitor_id, journey_id, landing_url, referrer, source)
        VALUES
          (${project.id}, ${input.session_id}, ${visitorId}, ${journeyId},
           ${input.landing_url}, ${input.referrer || null}, ${sql.json(input.source)})
        ON CONFLICT (project_id, session_id) DO UPDATE SET last_seen_at = now()
      `;
    });
    return {
      accepted: true,
      visitor_id: visitorId,
      journey_id: journeyId,
      tracking_token: createTrackingToken(
        { projectId: project.id, visitorId, journeyId },
        env.WEBHOOK_SECRET,
      ),
    };
  });

  app.post('/track/events', { bodyLimit: 64 * 1024 }, async (req, reply) => {
    if (!app.db) return reply.code(503).send({ accepted: false });
    const parsed = EventSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ accepted: false });
    const event = parsed.data;
    const [project] = await app.db<{ id: string; enabled: boolean }[]>`
      SELECT id, enabled FROM tracking_projects WHERE public_key = ${event.public_key}
    `;
    if (!project?.enabled) return reply.code(404).send({ accepted: false });
    await app.db`
      INSERT INTO tracking_events
        (id, project_id, visitor_id, session_id, journey_id, event_name, event_category,
         event_url, page_title, referrer, source, properties, consent_state,
         client_ip, user_agent, client_at)
      VALUES
        (${event.event_id}, ${project.id}, ${event.visitor_id}, ${event.session_id ?? null},
         ${event.journey_id ?? null}, ${event.event_name}, ${event.event_category},
         ${event.event_url}, ${event.page_title ?? null}, ${event.referrer || null},
         ${app.db.json(event.source)}, ${app.db.json(event.properties as never)},
         ${event.consent_state ?? null}, ${req.ip}, ${req.headers['user-agent'] ?? null},
         ${event.client_at ?? null})
      ON CONFLICT (project_id, id) DO NOTHING
    `;
    await app.db`
      UPDATE tracking_visitors SET last_seen_at = now(),
        last_source = CASE
          WHEN ${app.db.json(event.source)} = '{}'::jsonb THEN last_source
          ELSE last_source || ${app.db.json(event.source)}
        END
      WHERE project_id = ${project.id} AND visitor_id = ${event.visitor_id}
    `;
    return reply.code(202).send({ accepted: true });
  });

  app.post<{ Querystring: { token?: string } }>(
    '/webhooks/vendepay',
    { bodyLimit: 256 * 1024, logLevel: 'silent' },
    async (req, reply) => {
      if (!app.db || !req.query.token) return reply.code(404).send({ accepted: false });
      const candidate = tokenHash(req.query.token);
      const connections = await app.db<
        Array<{ id: string; project_id: string; token_hash: string }>
      >`
        SELECT id, project_id, token_hash
        FROM vendepay_connections
        WHERE token_hash = ${candidate} AND enabled = true
        LIMIT 1
      `;
      const connection = connections[0];
      if (!connection) return reply.code(404).send({ accepted: false });

      const normalized = normalizeVendepay(req.body);
      const receiptId = ulid();
      const outcome = await app.db.begin(async (sql) => {
        const receipts = await sql<{ id: string }[]>`
          INSERT INTO webhook_receipts
            (id, connection_id, dedupe_key, payload, state, diagnostics)
          VALUES
            (${receiptId}, ${connection.id}, ${normalized.dedupeKey}, ${sql.json(req.body as never)},
             ${normalized.kind}, ${sql.json(normalized.kind === 'quarantined' ? normalized.diagnostics : [])})
          ON CONFLICT (connection_id, dedupe_key) DO NOTHING
          RETURNING id
        `;
        if (receipts.length === 0 || normalized.kind !== 'processable') {
          return {
            inserted: receipts.length > 0,
            deliveryIds: [] as string[],
            utmifyDeliveryIds: [] as string[],
          };
        }
        const event = normalized.event;
        const trackingIdentity = event.trackingSrc
          ? readTrackingToken(event.trackingSrc, env.WEBHOOK_SECRET)
          : null;
        const attributedVisitorId =
          trackingIdentity?.projectId === connection.project_id
            ? trackingIdentity.visitorId
            : event.trackingSrc;
        const [order] = await sql<{ id: string; status: string }[]>`
          INSERT INTO tracking_orders
            (id, project_id, provider, external_id, status, amount_minor, currency,
             visitor_id, buyer, raw_status, occurred_at, paid_at, payment_method,
             product, attribution_source)
          VALUES
            (${ulid()}, ${connection.project_id}, 'vendepay', ${event.transactionId},
             ${event.status}, ${event.amountMinor ?? null}, ${event.currency ?? null},
             ${attributedVisitorId ?? null}, ${sql.json(event.buyer)}, ${event.rawStatus ?? null},
             ${event.occurredAt}, ${event.status === 'paid' ? event.occurredAt : null},
             ${event.paymentMethod ?? null}, ${sql.json(event.product)}, ${sql.json(event.source)})
          ON CONFLICT (project_id, provider, external_id) DO UPDATE SET
            status = CASE
              WHEN tracking_orders.status IN ('refunded', 'chargeback') THEN tracking_orders.status
              WHEN tracking_orders.status = 'paid' AND EXCLUDED.status IN ('pending', 'refused', 'unknown')
                THEN tracking_orders.status
              WHEN tracking_orders.status IN ('cancelled', 'refused') AND EXCLUDED.status IN ('pending', 'unknown')
                THEN tracking_orders.status
              ELSE EXCLUDED.status
            END,
            amount_minor = COALESCE(EXCLUDED.amount_minor, tracking_orders.amount_minor),
            currency = COALESCE(EXCLUDED.currency, tracking_orders.currency),
            visitor_id = COALESCE(EXCLUDED.visitor_id, tracking_orders.visitor_id),
            buyer = tracking_orders.buyer || EXCLUDED.buyer,
            raw_status = COALESCE(EXCLUDED.raw_status, tracking_orders.raw_status),
            payment_method = COALESCE(EXCLUDED.payment_method, tracking_orders.payment_method),
            product = tracking_orders.product || EXCLUDED.product,
            attribution_source = tracking_orders.attribution_source || EXCLUDED.attribution_source,
            occurred_at = LEAST(tracking_orders.occurred_at, EXCLUDED.occurred_at),
            paid_at = CASE
              WHEN EXCLUDED.status = 'paid' THEN COALESCE(tracking_orders.paid_at, EXCLUDED.paid_at)
              ELSE tracking_orders.paid_at
            END,
            updated_at = now()
          RETURNING id, status
        `;
        if (!order) {
          return { inserted: true, deliveryIds: [], utmifyDeliveryIds: [] };
        }
        await sql`
          UPDATE webhook_receipts
          SET order_id = ${order.id}, processed_at = now()
          WHERE id = ${receiptId}
        `;
        const utmify = await sql<{ id: string }[]>`
          SELECT id FROM tracking_utmify_destinations
          WHERE project_id = ${connection.project_id} AND enabled = true
        `;
        const utmifyDeliveryIds: string[] = [];
        for (const destination of utmify) {
          const id = ulid();
          const rows = await sql<{ id: string }[]>`
            INSERT INTO tracking_delivery_outbox
              (id, project_id, destination_kind, destination_id, order_id, event_id, event_type)
            VALUES
              (${id}, ${connection.project_id}, 'utmify', ${destination.id}, ${order.id},
               ${`vendepay:${event.transactionId}:${event.status}`}, ${`order.${event.status}`})
            ON CONFLICT (destination_kind, destination_id, event_id) DO NOTHING
            RETURNING id
          `;
          if (rows[0]) utmifyDeliveryIds.push(rows[0].id);
        }
        if (order.status !== 'paid') {
          return { inserted: true, deliveryIds: [], utmifyDeliveryIds };
        }
        const [rules] = await sql<
          Array<{ attributed_only: boolean; minimum_amount_minor: number }>
        >`
          SELECT attributed_only, minimum_amount_minor
          FROM tracking_meta_rules WHERE project_id = ${connection.project_id}
        `;
        if (
          (rules?.attributed_only && !event.trackingSrc) ||
          (rules && (event.amountMinor ?? 0) < rules.minimum_amount_minor)
        ) {
          return { inserted: true, deliveryIds: [], utmifyDeliveryIds };
        }
        const pixels = await sql<{ id: string }[]>`
          SELECT id FROM meta_pixels
          WHERE project_id = ${connection.project_id} AND enabled = true
        `;
        const deliveryIds: string[] = [];
        for (const pixel of pixels) {
          const deliveryId = ulid();
          const deliveries = await sql<{ id: string }[]>`
            INSERT INTO meta_deliveries
              (id, project_id, pixel_id, order_id, event_id)
            VALUES
              (${deliveryId}, ${connection.project_id}, ${pixel.id}, ${order.id},
               ${`vendepay:${event.transactionId}:purchase`})
            ON CONFLICT (pixel_id, event_id) DO NOTHING
            RETURNING id
          `;
          if (deliveries[0]) deliveryIds.push(deliveries[0].id);
        }
        return { inserted: true, deliveryIds, utmifyDeliveryIds };
      });
      await Promise.allSettled(
        outcome.deliveryIds.map((deliveryId) => app.metaQueue.add('send', { deliveryId })),
      );
      await Promise.allSettled(
        outcome.utmifyDeliveryIds.map((deliveryId) =>
          app.utmifyDeliveryQueue.add('send', { deliveryId }),
        ),
      );
      return reply.code(outcome.inserted ? 202 : 200).send({
        accepted: true,
        receipt_id: receiptId,
        meta_deliveries: outcome.deliveryIds.length,
        utmify_deliveries: outcome.utmifyDeliveryIds.length,
        ...(!outcome.inserted ? { duplicate: true } : {}),
      });
    },
  );
};

export default plugin;
