import { createHash, randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { ulid } from 'ulid';
import { z } from 'zod';
import { env } from '../env.js';
import { normalizeVendepay } from '../integrations/vendepay/normalize.js';
import { NotFoundError, zodToProblem } from '../lib/problem.js';
import { encryptSecret } from '../lib/secret-box.js';
import { saoPauloParts } from '../services/intraday-store.js';
import { saoPauloDayRange } from '../services/utmify-sync.js';

const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(25),
});
const TrackingDateSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
const TrackingPaginationSchema = PaginationSchema.merge(TrackingDateSchema);

const VendepaySigningSecretSchema = z.object({
  signing_secret: z.string().trim().min(16).max(4096),
});

type PaginationQuery = {
  page?: string | number;
  per_page?: string | number;
  date?: string;
};

const databaseUnavailable = {
  error: 'tracking_database_unavailable',
  detail: 'A infraestrutura de tracking está temporariamente indisponível.',
};

const webhookUrl = (token: string) =>
  `${env.TRACKING_PUBLIC_BASE_URL.replace(/\/$/, '')}/v1/webhooks/vendepay?token=${token}`;

const installCode = (publicKey: string) =>
  `<script async src="${env.TRACKING_PUBLIC_BASE_URL.replace(/\/$/, '')}/v1/track/t.js?key=${publicKey}"></script>`;

const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

function parsePagination(query: PaginationQuery) {
  const parsed = TrackingPaginationSchema.safeParse(query);
  if (!parsed.success) throw zodToProblem(parsed.error);
  return {
    ...parsed.data,
    offset: (parsed.data.page - 1) * parsed.data.per_page,
  };
}

function parseTrackingDate(query: { date?: string }) {
  const parsed = TrackingDateSchema.safeParse(query);
  if (!parsed.success) throw zodToProblem(parsed.error);
  const now = new Date();
  const today = saoPauloParts(now).date;
  const date = parsed.data.date ?? today;
  if (date > today) {
    throw zodToProblem(
      new z.ZodError([
        {
          code: 'custom',
          path: ['date'],
          message: 'A data não pode estar no futuro.',
        },
      ]),
    );
  }
  const range = saoPauloDayRange(date, now);
  return { date, from: new Date(range.from), to: new Date(range.to) };
}

function pagination(page: number, perPage: number, total: number) {
  return {
    page,
    per_page: perPage,
    total,
    total_pages: Math.ceil(total / perPage),
  };
}

const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.post<{ Params: { id: string }; Querystring: { date?: string } }>(
    '/offers/:id/tracking/initiate-checkout/reconcile',
    async (req, reply) => {
      await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db) return reply.code(503).send(databaseUnavailable);
      const { date, from, to } = parseTrackingDate(req.query);
      const [project] = await app.db<{ id: string }[]>`
        SELECT id FROM tracking_projects
        WHERE offer_id = ${req.params.id} AND enabled = true
      `;
      if (!project) throw new NotFoundError('Projeto de tracking não encontrado.');

      const result = await app.db.begin(async (sql) => {
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
        `;
        const destinations = await sql<{ id: string }[]>`
          SELECT id FROM tracking_utmify_destinations
          WHERE project_id = ${project.id} AND enabled = true
        `;
        const meta: Array<{ id: string }> = [];
        const utmify: Array<{ id: string }> = [];
        for (const event of events) {
          for (const pixel of pixels) {
            const rows = await sql<{ id: string }[]>`
              INSERT INTO meta_deliveries AS existing
                (id, project_id, pixel_id, order_id, event_id, event_name, event_at)
              VALUES
                (${ulid()}, ${project.id}, ${pixel.id}, NULL, ${event.id},
                 'InitiateCheckout', ${event.received_at})
              ON CONFLICT (pixel_id, event_id) DO UPDATE SET
                state = 'pending',
                attempts = 0,
                last_error = NULL
              WHERE existing.state <> 'delivered'
              RETURNING id
            `;
            if (rows[0]) meta.push(rows[0]);
          }
          for (const destination of destinations) {
            const rows = await sql<{ id: string }[]>`
              INSERT INTO tracking_delivery_outbox AS existing
                (id, project_id, destination_kind, destination_id, order_id, event_id, event_type)
              VALUES
                (${ulid()}, ${project.id}, 'utmify', ${destination.id}, NULL, ${event.id},
                 'event.initiate_checkout')
              ON CONFLICT (destination_kind, destination_id, event_id) DO UPDATE SET
                state = 'pending',
                attempts = 0,
                last_error = NULL,
                next_attempt_at = now()
              WHERE existing.state <> 'delivered'
              RETURNING id
            `;
            if (rows[0]) utmify.push(rows[0]);
          }
        }
        return {
          eventsFound: events.length,
          pixelCount: pixels.length,
          destinationCount: destinations.length,
          meta,
          utmify,
        };
      });

      await Promise.allSettled([
        ...result.meta.map(({ id }) => app.metaQueue.add('send', { deliveryId: id })),
        ...result.utmify.map(({ id }) =>
          app.utmifyDeliveryQueue.add('send', { deliveryId: id }, { jobId: id }),
        ),
      ]);
      return reply.code(202).send({
        date,
        events_found: result.eventsFound,
        pixels_enabled: result.pixelCount,
        utmify_destinations_enabled: result.destinationCount,
        meta_queued: result.meta.length,
        utmify_queued: result.utmify.length,
      });
    },
  );

  app.get<{ Params: { id: string } }>('/offers/:id/tracking/diagnostics', async (req, reply) => {
    await app.offerStore.assertAccess(req.params.id, req.user!.sub, req.user!.role === 'admin');
    if (!app.db) {
      return reply.code(503).send({
        managed: true,
        database: 'unavailable',
        migrations: 'unavailable',
        encryption: env.TRACKING_ENCRYPTION_KEY ? 'ready' : 'unavailable',
        detail: 'O TMXHUB já está tentando restabelecer a infraestrutura automaticamente.',
      });
    }

    const [schema, activity] = await Promise.all([
      app.db<
        Array<{
          projects: string | null;
          events: string | null;
          orders: string | null;
          pixels: string | null;
          deliveries: string | null;
          domains: string | null;
          ab_tests: string | null;
          outbox: string | null;
          vendepay_observability: boolean;
        }>
      >`
        SELECT
          to_regclass('public.tracking_projects')::text AS projects,
          to_regclass('public.tracking_events')::text AS events,
          to_regclass('public.tracking_orders')::text AS orders,
          to_regclass('public.meta_pixels')::text AS pixels,
          to_regclass('public.meta_deliveries')::text AS deliveries,
          to_regclass('public.tracking_domains')::text AS domains,
          to_regclass('public.tracking_ab_tests')::text AS ab_tests,
          to_regclass('public.tracking_delivery_outbox')::text AS outbox,
          EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'webhook_receipts'
              AND column_name = 'processed_at'
          ) AS vendepay_observability
      `,
      app.db<
        Array<{
          last_event_at: Date | null;
          last_order_at: Date | null;
          pending_meta: number;
          failed_meta: number;
        }>
      >`
        SELECT
          (SELECT max(e.received_at) FROM tracking_events e
            JOIN tracking_projects p ON p.id = e.project_id
            WHERE p.offer_id = ${req.params.id}) AS last_event_at,
          (SELECT max(o.occurred_at) FROM tracking_orders o
            JOIN tracking_projects p ON p.id = o.project_id
            WHERE p.offer_id = ${req.params.id}) AS last_order_at,
          (SELECT count(*)::int FROM meta_deliveries d
            JOIN tracking_projects p ON p.id = d.project_id
            WHERE p.offer_id = ${req.params.id} AND d.state = 'pending') AS pending_meta,
          (SELECT count(*)::int FROM meta_deliveries d
            JOIN tracking_projects p ON p.id = d.project_id
            WHERE p.offer_id = ${req.params.id} AND d.state = 'failed') AS failed_meta
      `,
    ]);
    const tables = schema[0];
    const schemaReady = Boolean(
      tables?.projects &&
        tables.events &&
        tables.orders &&
        tables.pixels &&
        tables.deliveries &&
        tables.domains &&
        tables.ab_tests &&
        tables.outbox &&
        tables.vendepay_observability,
    );
    return {
      managed: true,
      database: 'ready',
      migrations: schemaReady ? 'ready' : 'updating',
      encryption: env.TRACKING_ENCRYPTION_KEY ? 'ready' : 'unavailable',
      schema_version: schemaReady ? 5 : null,
      last_event_at: activity[0]?.last_event_at ?? null,
      last_order_at: activity[0]?.last_order_at ?? null,
      meta: {
        pending: activity[0]?.pending_meta ?? 0,
        failed: activity[0]?.failed_meta ?? 0,
      },
      detail: schemaReady
        ? 'Banco, migrations e criptografia são gerenciados automaticamente pelo TMXHUB.'
        : 'O TMXHUB está atualizando a estrutura do tracking automaticamente.',
    };
  });

  app.post<{ Params: { id: string } }>('/offers/:id/tracking/setup', async (req, reply) => {
    await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
    if (!app.db) return reply.code(503).send(databaseUnavailable);

    const existing = await app.db<
      Array<{ public_key: string; id: string; connection_id: string | null }>
    >`
      SELECT p.id, p.public_key, v.id AS connection_id
      FROM tracking_projects p
      LEFT JOIN vendepay_connections v ON v.project_id = p.id
      WHERE p.offer_id = ${req.params.id}
      ORDER BY v.created_at DESC NULLS LAST
      LIMIT 1
    `;
    if (existing[0]) {
      return reply.send({
        already_configured: true,
        project_id: existing[0].id,
        public_key: existing[0].public_key,
        install_code: installCode(existing[0].public_key),
        vendepay_webhook_url: null,
        warning: existing[0].connection_id
          ? 'O tracking já estava configurado. Gere uma nova URL somente se precisar substituir o webhook na Vendepay.'
          : 'O projeto já existia, mas a conexão Vendepay precisa ser reparada.',
      });
    }
    const projectId = ulid();
    const connectionId = ulid();
    const publicKey = randomBytes(18).toString('base64url');
    const webhookToken = randomBytes(32).toString('base64url');
    await app.db.begin(async (sql) => {
      await sql`
        INSERT INTO tracking_projects (id, offer_id, public_key)
        VALUES (${projectId}, ${req.params.id}, ${publicKey})
      `;
      await sql`
        INSERT INTO vendepay_connections (id, project_id, token_hash)
        VALUES (${connectionId}, ${projectId}, ${tokenHash(webhookToken)})
      `;
    });
    return reply.code(201).send({
      project_id: projectId,
      public_key: publicKey,
      install_code: installCode(publicKey),
      vendepay_webhook_url: webhookUrl(webhookToken),
      warning: 'A URL do webhook é exibida apenas nesta criação.',
    });
  });

  app.get<{ Params: { id: string } }>('/offers/:id/tracking', async (req, reply) => {
    await app.offerStore.assertAccess(req.params.id, req.user!.sub, req.user!.role === 'admin');
    reply.header('Cache-Control', 'private, no-store, max-age=0');
    if (!app.db) return reply.code(503).send(databaseUnavailable);

    const [project] = await app.db<
      Array<{
        id: string;
        public_key: string;
        enabled: boolean;
        created_at: Date;
        updated_at: Date;
        connection_id: string | null;
        vendepay_enabled: boolean | null;
        propagation_param: string | null;
        connection_created_at: Date | null;
        vendepay_signing_secret_configured: boolean;
      }>
    >`
      SELECT
        p.id, p.public_key, p.enabled, p.created_at, p.updated_at,
        v.id AS connection_id, v.enabled AS vendepay_enabled,
        v.propagation_param, v.created_at AS connection_created_at,
        (v.signing_secret_encrypted IS NOT NULL) AS vendepay_signing_secret_configured
      FROM tracking_projects p
      LEFT JOIN vendepay_connections v ON v.project_id = p.id
      WHERE p.offer_id = ${req.params.id}
      ORDER BY v.created_at DESC NULLS LAST
      LIMIT 1
    `;
    if (!project) {
      return {
        configured: false,
        offer_id: req.params.id,
      };
    }
    return {
      configured: true,
      project: {
        id: project.id,
        offer_id: req.params.id,
        public_key: project.public_key,
        enabled: project.enabled,
        install_code: installCode(project.public_key),
        created_at: project.created_at,
        updated_at: project.updated_at,
      },
      vendepay: {
        configured: Boolean(project.connection_id),
        enabled: project.vendepay_enabled ?? false,
        propagation_param: project.propagation_param ?? 'src',
        created_at: project.connection_created_at,
        signing_secret_configured: project.vendepay_signing_secret_configured,
      },
    };
  });

  app.put<{ Params: { id: string } }>(
    '/offers/:id/tracking/vendepay/signing-secret',
    async (req, reply) => {
      await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db || !env.TRACKING_ENCRYPTION_KEY) {
        return reply.code(503).send({ error: 'tracking_encryption_unavailable' });
      }
      const parsed = VendepaySigningSecretSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_vendepay_signing_secret' });
      }
      const updated = await app.db<{ id: string; signing_secret_updated_at: Date }[]>`
        UPDATE vendepay_connections v
        SET
          signing_secret_encrypted =
            ${encryptSecret(parsed.data.signing_secret, env.TRACKING_ENCRYPTION_KEY)},
          signing_secret_updated_at = now()
        FROM tracking_projects p
        WHERE v.project_id = p.id AND p.offer_id = ${req.params.id}
        RETURNING v.id, v.signing_secret_updated_at
      `;
      if (!updated[0]) {
        throw new NotFoundError('O tracking Vendepay ainda não foi configurado para esta oferta.');
      }
      return reply.send({
        configured: true,
        updated_at: updated[0].signing_secret_updated_at,
      });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/offers/:id/tracking/vendepay/rotate-token',
    async (req, reply) => {
      await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db) return reply.code(503).send(databaseUnavailable);

      const token = randomBytes(32).toString('base64url');
      const updated = await app.db<{ id: string }[]>`
        UPDATE vendepay_connections v
        SET token_hash = ${tokenHash(token)}
        FROM tracking_projects p
        WHERE v.project_id = p.id AND p.offer_id = ${req.params.id}
        RETURNING v.id
      `;
      if (updated.length === 0) {
        throw new NotFoundError('O tracking Vendepay ainda não foi configurado para esta oferta.');
      }
      return reply.send({
        vendepay_webhook_url: webhookUrl(token),
        warning:
          'A URL anterior deixou de funcionar. Esta nova URL é exibida apenas nesta rotação.',
      });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/offers/:id/tracking/vendepay/preview',
    async (req, reply) => {
      await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
      const normalized = normalizeVendepay(req.body);
      if (normalized.kind === 'quarantined') {
        return reply.send({
          processable: false,
          diagnostics: normalized.diagnostics,
        });
      }
      return {
        processable: true,
        normalized: normalized.event,
      };
    },
  );

  app.get<{ Params: { id: string } }>(
    '/offers/:id/tracking/vendepay/receipts',
    async (req, reply) => {
      await app.offerStore.assertAccess(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db) return reply.code(503).send({ receipts: [] });
      const receipts = await app.db`
        SELECT r.id, r.state, r.diagnostics, r.received_at, r.processed_at,
               o.external_id AS transaction_id, o.status AS order_status,
               o.amount_minor, o.currency, o.payment_method, o.product
        FROM webhook_receipts r
        JOIN vendepay_connections v ON v.id = r.connection_id
        JOIN tracking_projects p ON p.id = v.project_id
        LEFT JOIN tracking_orders o ON o.id = r.order_id
        WHERE p.offer_id = ${req.params.id}
        ORDER BY r.received_at DESC
        LIMIT 100
      `;
      return { receipts };
    },
  );

  app.get<{ Params: { id: string }; Querystring: PaginationQuery }>(
    '/offers/:id/tracking/events',
    async (req, reply) => {
      await app.offerStore.assertAccess(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db) return reply.code(503).send(databaseUnavailable);
      const { page, per_page: perPage, offset } = parsePagination(req.query);
      const { date, from, to } = parseTrackingDate(req.query);

      const [items, totals] = await Promise.all([
        app.db<
          Array<{
            id: string;
            visitor_id: string;
            session_id: string | null;
            event_name: string;
            event_url: string;
            page_title: string | null;
            referrer: string | null;
            source: Record<string, string>;
            client_at: Date | null;
            received_at: Date;
          }>
        >`
          SELECT e.id, e.visitor_id, e.session_id, e.event_name, e.event_url, e.page_title,
                 e.referrer, e.source, e.client_at, e.received_at
          FROM tracking_events e
          JOIN tracking_projects p ON p.id = e.project_id
          WHERE p.offer_id = ${req.params.id}
            AND e.received_at >= ${from} AND e.received_at < ${to}
          ORDER BY e.received_at DESC, e.id DESC
          LIMIT ${perPage} OFFSET ${offset}
        `,
        app.db<{ total: number }[]>`
          SELECT count(*)::int AS total
          FROM tracking_events e
          JOIN tracking_projects p ON p.id = e.project_id
          WHERE p.offer_id = ${req.params.id}
            AND e.received_at >= ${from} AND e.received_at < ${to}
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

  app.get<{ Params: { id: string }; Querystring: { date?: string } }>(
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

  app.get<{ Params: { id: string }; Querystring: { date?: string } }>(
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

  app.get<{ Params: { id: string }; Querystring: { date?: string } }>(
    '/offers/:id/tracking/countries',
    async (req, reply) => {
      await app.offerStore.assertAccess(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db) return reply.code(503).send(databaseUnavailable);
      const { date, from, to } = parseTrackingDate(req.query);
      const rows = await app.db`
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
            AND e.event_name IN ('PageView', 'InitiateCheckout')
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
            COALESCE(sum(o.amount_minor) FILTER (WHERE o.status = 'paid'), 0)::text
              AS paid_revenue_minor
          FROM tracking_orders o
          JOIN tracking_projects p ON p.id = o.project_id
          LEFT JOIN LATERAL (
            SELECT e.source
            FROM tracking_events e
            WHERE e.project_id = o.project_id AND e.visitor_id = o.visitor_id
            ORDER BY e.received_at DESC
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
          COALESCE(o.paid_revenue_minor, '0') AS paid_revenue_minor
        FROM event_counts e
        FULL OUTER JOIN order_counts o ON o.country = e.country
        ORDER BY page_views DESC, checkouts DESC, paid_orders DESC
      `;
      return { date, time_zone: 'America/Sao_Paulo', rows };
    },
  );

  app.get<{ Params: { id: string }; Querystring: { date?: string } }>(
    '/offers/:id/tracking/attribution',
    async (req, reply) => {
      await app.offerStore.assertAccess(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db) return reply.code(503).send(databaseUnavailable);
      const { date, from, to } = parseTrackingDate(req.query);
      const rows = await app.db`
        SELECT
          COALESCE(NULLIF(o.attribution_source->>'utm_source', ''),
                   NULLIF(o.attribution_source->>'site_source_name', ''),
                   'não identificado') AS source,
          COALESCE(NULLIF(o.attribution_source->>'utm_campaign', ''),
                   NULLIF(o.attribution_source->>'campaign_name', ''),
                   'não identificada') AS campaign_name,
          NULLIF(o.attribution_source->>'campaign_id', '') AS campaign_id,
          COALESCE(NULLIF(o.attribution_source->>'utm_term', ''),
                   NULLIF(o.attribution_source->>'adset_name', ''),
                   'não identificado') AS adset_name,
          NULLIF(o.attribution_source->>'adset_id', '') AS adset_id,
          COALESCE(NULLIF(o.attribution_source->>'utm_content', ''),
                   NULLIF(o.attribution_source->>'ad_name', ''),
                   'não identificado') AS ad_name,
          NULLIF(o.attribution_source->>'ad_id', '') AS ad_id,
          COALESCE(NULLIF(o.attribution_source->>'placement', ''), 'não identificado') AS placement,
          count(*)::int AS orders,
          count(*) FILTER (WHERE o.status = 'paid')::int AS paid_orders,
          count(*) FILTER (WHERE o.status IN ('refused', 'cancelled'))::int AS refused_orders,
          COALESCE(sum(o.amount_minor) FILTER (WHERE o.status = 'paid'), 0)::text
            AS paid_revenue_minor
        FROM tracking_orders o
        JOIN tracking_projects p ON p.id = o.project_id
        WHERE p.offer_id = ${req.params.id}
          AND o.occurred_at >= ${from} AND o.occurred_at < ${to}
        GROUP BY 1, 2, 3, 4, 5, 6, 7, 8
        ORDER BY paid_orders DESC, orders DESC, campaign_name, ad_name
        LIMIT 500
      `;
      return { date, time_zone: 'America/Sao_Paulo', rows };
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

  app.get<{ Params: { id: string }; Querystring: { date?: string } }>(
    '/offers/:id/tracking/summary',
    async (req, reply) => {
      await app.offerStore.assertAccess(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db) return reply.code(503).send(databaseUnavailable);
      const { date, from, to } = parseTrackingDate(req.query);

      const [summary] = await app.db<
        Array<{
          events: number;
          visitors: number;
          page_views: number;
          checkouts: number;
          orders: number;
          paid_orders: number;
          orphan_orders: number;
          paid_revenue_minor: string;
        }>
      >`
      SELECT
        (SELECT count(*)::int FROM tracking_events e WHERE e.project_id = p.id
          AND e.received_at >= ${from} AND e.received_at < ${to}) AS events,
        (SELECT count(DISTINCT e.visitor_id)::int FROM tracking_events e
          WHERE e.project_id = p.id
            AND e.received_at >= ${from} AND e.received_at < ${to}) AS visitors,
        (SELECT count(*)::int FROM tracking_events e
          WHERE e.project_id = p.id AND e.event_name = 'PageView'
            AND e.received_at >= ${from} AND e.received_at < ${to}) AS page_views,
        (SELECT count(*)::int FROM tracking_events e
          WHERE e.project_id = p.id AND e.event_name = 'InitiateCheckout'
            AND e.received_at >= ${from} AND e.received_at < ${to}) AS checkouts,
        (SELECT count(*)::int FROM tracking_orders o WHERE o.project_id = p.id
          AND o.occurred_at >= ${from} AND o.occurred_at < ${to}) AS orders,
        (SELECT count(*)::int FROM tracking_orders o
          WHERE o.project_id = p.id AND o.status = 'paid'
            AND o.occurred_at >= ${from} AND o.occurred_at < ${to}) AS paid_orders,
        (SELECT count(*)::int FROM tracking_orders o
          WHERE o.project_id = p.id AND NULLIF(trim(o.visitor_id), '') IS NULL
            AND o.occurred_at >= ${from} AND o.occurred_at < ${to}) AS orphan_orders,
        (SELECT COALESCE(sum(o.amount_minor), 0)::text FROM tracking_orders o
          WHERE o.project_id = p.id AND o.status = 'paid'
            AND o.occurred_at >= ${from} AND o.occurred_at < ${to}) AS paid_revenue_minor
      FROM tracking_projects p
      WHERE p.offer_id = ${req.params.id}
    `;
      return {
        date,
        time_zone: 'America/Sao_Paulo',
        ...(summary ?? {
          events: 0,
          visitors: 0,
          page_views: 0,
          checkouts: 0,
          orders: 0,
          paid_orders: 0,
          orphan_orders: 0,
          paid_revenue_minor: '0',
        }),
      };
    },
  );
};

export default plugin;
