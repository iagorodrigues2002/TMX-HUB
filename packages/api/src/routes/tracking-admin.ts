import { createHash, randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { ulid } from 'ulid';
import { z } from 'zod';
import { env } from '../env.js';
import { normalizeVendepay } from '../integrations/vendepay/normalize.js';
import { NotFoundError, zodToProblem } from '../lib/problem.js';

const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(25),
});

type PaginationQuery = {
  page?: string | number;
  per_page?: string | number;
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
  const parsed = PaginationSchema.safeParse(query);
  if (!parsed.success) throw zodToProblem(parsed.error);
  return {
    ...parsed.data,
    offset: (parsed.data.page - 1) * parsed.data.per_page,
  };
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

    const existing = await app.db<Array<{ public_key: string; id: string }>>`
      SELECT id, public_key FROM tracking_projects WHERE offer_id = ${req.params.id}
    `;
    if (existing[0]) {
      return reply.code(409).send({
        error: 'tracking_already_configured',
        public_key: existing[0].public_key,
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
      }>
    >`
      SELECT
        p.id, p.public_key, p.enabled, p.created_at, p.updated_at,
        v.id AS connection_id, v.enabled AS vendepay_enabled,
        v.propagation_param, v.created_at AS connection_created_at
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
      },
    };
  });

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

      const [items, totals] = await Promise.all([
        app.db<
          Array<{
            id: string;
            visitor_id: string;
            session_id: string | null;
            event_name: string;
            event_url: string;
            referrer: string | null;
            source: Record<string, string>;
            client_at: Date | null;
            received_at: Date;
          }>
        >`
          SELECT e.id, e.visitor_id, e.session_id, e.event_name, e.event_url,
                 e.referrer, e.source, e.client_at, e.received_at
          FROM tracking_events e
          JOIN tracking_projects p ON p.id = e.project_id
          WHERE p.offer_id = ${req.params.id}
          ORDER BY e.received_at DESC, e.id DESC
          LIMIT ${perPage} OFFSET ${offset}
        `,
        app.db<{ total: number }[]>`
          SELECT count(*)::int AS total
          FROM tracking_events e
          JOIN tracking_projects p ON p.id = e.project_id
          WHERE p.offer_id = ${req.params.id}
        `,
      ]);
      const total = totals[0]?.total ?? 0;
      return { items, pagination: pagination(page, perPage, total) };
    },
  );

  app.get<{ Params: { id: string }; Querystring: PaginationQuery }>(
    '/offers/:id/tracking/orders',
    async (req, reply) => {
      await app.offerStore.assertAccess(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db) return reply.code(503).send(databaseUnavailable);
      const { page, per_page: perPage, offset } = parsePagination(req.query);

      const [items, totals] = await Promise.all([
        app.db`
          SELECT o.id, o.provider, o.external_id, o.status, o.amount_minor,
                 o.currency, o.visitor_id, o.buyer, o.raw_status,
                 o.occurred_at, o.updated_at
          FROM tracking_orders o
          JOIN tracking_projects p ON p.id = o.project_id
          WHERE p.offer_id = ${req.params.id}
          ORDER BY o.occurred_at DESC, o.id DESC
          LIMIT ${perPage} OFFSET ${offset}
        `,
        app.db<{ total: number }[]>`
          SELECT count(*)::int AS total
          FROM tracking_orders o
          JOIN tracking_projects p ON p.id = o.project_id
          WHERE p.offer_id = ${req.params.id}
        `,
      ]);
      const total = totals[0]?.total ?? 0;
      return { items, pagination: pagination(page, perPage, total) };
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

  app.get<{ Params: { id: string } }>('/offers/:id/tracking/summary', async (req, reply) => {
    await app.offerStore.assertAccess(req.params.id, req.user!.sub, req.user!.role === 'admin');
    if (!app.db) return reply.code(503).send(databaseUnavailable);

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
        (SELECT count(*)::int FROM tracking_events e WHERE e.project_id = p.id) AS events,
        (SELECT count(DISTINCT e.visitor_id)::int FROM tracking_events e
          WHERE e.project_id = p.id) AS visitors,
        (SELECT count(*)::int FROM tracking_events e
          WHERE e.project_id = p.id AND e.event_name = 'PageView') AS page_views,
        (SELECT count(*)::int FROM tracking_events e
          WHERE e.project_id = p.id AND e.event_name = 'InitiateCheckout') AS checkouts,
        (SELECT count(*)::int FROM tracking_orders o WHERE o.project_id = p.id) AS orders,
        (SELECT count(*)::int FROM tracking_orders o
          WHERE o.project_id = p.id AND o.status = 'paid') AS paid_orders,
        (SELECT count(*)::int FROM tracking_orders o
          WHERE o.project_id = p.id AND NULLIF(trim(o.visitor_id), '') IS NULL) AS orphan_orders,
        (SELECT COALESCE(sum(o.amount_minor), 0)::text FROM tracking_orders o
          WHERE o.project_id = p.id AND o.status = 'paid') AS paid_revenue_minor
      FROM tracking_projects p
      WHERE p.offer_id = ${req.params.id}
    `;
    return (
      summary ?? {
        events: 0,
        visitors: 0,
        page_views: 0,
        checkouts: 0,
        orders: 0,
        paid_orders: 0,
        orphan_orders: 0,
        paid_revenue_minor: '0',
      }
    );
  });
};

export default plugin;
