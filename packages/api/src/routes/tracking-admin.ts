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
const UtmifyPixelSchema = z.object({
  pixel_id: z
    .string()
    .trim()
    .regex(/^[a-f0-9]{24}$/i, 'Use o ID de 24 caracteres exibido no Pixel da UTMify.'),
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
  app.get<{ Params: { id: string } }>('/offers/:id/tracking/utmify-pixel', async (req, reply) => {
    await app.offerStore.assertAccess(req.params.id, req.user!.sub, req.user!.role === 'admin');
    if (!app.db) return reply.code(503).send(databaseUnavailable);
    const [project] = await app.db<{ utmify_pixel_id: string | null }[]>`
        SELECT utmify_pixel_id
        FROM tracking_projects
        WHERE offer_id = ${req.params.id} AND enabled = true
      `;
    if (!project) throw new NotFoundError('Projeto de tracking não encontrado.');
    return reply.send({
      configured: Boolean(project.utmify_pixel_id),
      pixel_id: project.utmify_pixel_id,
    });
  });

  app.put<{ Params: { id: string } }>('/offers/:id/tracking/utmify-pixel', async (req, reply) => {
    await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
    if (!app.db) return reply.code(503).send(databaseUnavailable);
    const parsed = UtmifyPixelSchema.safeParse(req.body);
    if (!parsed.success) throw zodToProblem(parsed.error);
    const rows = await app.db<{ id: string }[]>`
      UPDATE tracking_projects
      SET utmify_pixel_id = ${parsed.data.pixel_id}, updated_at = now()
      WHERE offer_id = ${req.params.id} AND enabled = true
      RETURNING id
    `;
    if (!rows[0]) throw new NotFoundError('Projeto de tracking não encontrado.');
    return reply.send({ configured: true, pixel_id: parsed.data.pixel_id });
  });

  app.get<{ Params: { id: string }; Querystring: { date?: string } }>(
    '/offers/:id/tracking/utmify-web-events',
    async (req, reply) => {
      await app.offerStore.assertAccess(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db) return reply.code(503).send(databaseUnavailable);
      const { date, from, to } = parseTrackingDate(req.query);
      const rows = await app.db`
        SELECT ue.id, ue.event_id, ue.external_pixel_id AS pixel_id, ue.state, ue.attempts,
               ue.response_status, ue.last_error, ue.created_at, ue.delivered_at,
               te.source->>'campaign_id' AS campaign_id,
               te.source->>'adset_id' AS adset_id,
               te.source->>'ad_id' AS ad_id,
               te.source->>'placement' AS placement,
               ue.response->'lead'->>'_id' AS utmify_lead_id,
               ue.response->'event'->>'_id' AS utmify_event_id
        FROM tracking_utmify_web_events ue
        JOIN tracking_projects p ON p.id = ue.project_id
        JOIN tracking_events te ON te.project_id = ue.project_id AND te.id = ue.event_id
        WHERE p.offer_id = ${req.params.id}
          AND te.received_at >= ${from}
          AND te.received_at < ${to}
        ORDER BY ue.created_at DESC
        LIMIT 100
      `;
      return reply.send({ date, deliveries: rows });
    },
  );

  app.post<{ Params: { id: string; deliveryId: string } }>(
    '/offers/:id/tracking/utmify-web-events/:deliveryId/retry',
    async (req, reply) => {
      await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db) return reply.code(503).send(databaseUnavailable);
      const [delivery] = await app.db<{ id: string }[]>`
        UPDATE tracking_utmify_web_events ue
        SET state='pending', last_error=NULL, next_attempt_at=now()
        FROM tracking_projects p
        WHERE ue.id=${req.params.deliveryId}
          AND ue.project_id=p.id
          AND p.offer_id=${req.params.id}
        RETURNING ue.id
      `;
      if (!delivery) throw new NotFoundError('Entrega UTMify não encontrada.');
      await app.utmifyWebEventQueue.add('send', { deliveryId: delivery.id });
      return reply.code(202).send({ accepted: true });
    },
  );

  app.post<{ Params: { id: string }; Querystring: { date?: string } }>(
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
                ON CONFLICT (project_id, event_id) DO UPDATE SET
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

    const [schema, activity, utmify] = await Promise.all([
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
      app.db<
        Array<{
          destination_configured: boolean;
          destination_enabled: boolean | null;
          pending: number;
          failed: number;
          dead: number;
          delivered: number;
          last_delivered_at: Date | null;
          last_error: string | null;
        }>
      >`
        SELECT
          EXISTS (
            SELECT 1 FROM tracking_utmify_destinations u
            JOIN tracking_projects p ON p.id = u.project_id
            WHERE p.offer_id = ${req.params.id}
          ) AS destination_configured,
          (SELECT u.enabled FROM tracking_utmify_destinations u
            JOIN tracking_projects p ON p.id = u.project_id
            WHERE p.offer_id = ${req.params.id} LIMIT 1) AS destination_enabled,
          (SELECT count(*)::int FROM tracking_delivery_outbox d
            JOIN tracking_projects p ON p.id = d.project_id
            WHERE p.offer_id = ${req.params.id} AND d.destination_kind = 'utmify'
              AND d.state IN ('pending', 'processing')) AS pending,
          (SELECT count(*)::int FROM tracking_delivery_outbox d
            JOIN tracking_projects p ON p.id = d.project_id
            WHERE p.offer_id = ${req.params.id} AND d.destination_kind = 'utmify'
              AND d.state = 'failed') AS failed,
          (SELECT count(*)::int FROM tracking_delivery_outbox d
            JOIN tracking_projects p ON p.id = d.project_id
            WHERE p.offer_id = ${req.params.id} AND d.destination_kind = 'utmify'
              AND d.state = 'dead') AS dead,
          (SELECT count(*)::int FROM tracking_delivery_outbox d
            JOIN tracking_projects p ON p.id = d.project_id
            WHERE p.offer_id = ${req.params.id} AND d.destination_kind = 'utmify'
              AND d.state = 'delivered') AS delivered,
          (SELECT max(d.delivered_at) FROM tracking_delivery_outbox d
            JOIN tracking_projects p ON p.id = d.project_id
            WHERE p.offer_id = ${req.params.id} AND d.destination_kind = 'utmify') AS last_delivered_at,
          (SELECT d.last_error FROM tracking_delivery_outbox d
            JOIN tracking_projects p ON p.id = d.project_id
            WHERE p.offer_id = ${req.params.id} AND d.destination_kind = 'utmify'
              AND d.last_error IS NOT NULL
            ORDER BY d.created_at DESC LIMIT 1) AS last_error
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
      utmify: {
        destination_configured: utmify[0]?.destination_configured ?? false,
        destination_enabled: utmify[0]?.destination_enabled ?? false,
        worker_running: Boolean(env.TRACKING_ENCRYPTION_KEY),
        pending: utmify[0]?.pending ?? 0,
        failed: utmify[0]?.failed ?? 0,
        dead: utmify[0]?.dead ?? 0,
        delivered: utmify[0]?.delivered ?? 0,
        last_delivered_at: utmify[0]?.last_delivered_at ?? null,
        last_error: utmify[0]?.last_error ?? null,
        hint: !utmify[0]?.destination_configured
          ? 'Nenhum destino UTMify configurado para esta oferta — configure em Tracking > Configuração e testes.'
          : !utmify[0]?.destination_enabled
            ? 'Destino UTMify configurado mas desabilitado.'
            : !env.TRACKING_ENCRYPTION_KEY
              ? 'TRACKING_ENCRYPTION_KEY ausente no serviço da API — o worker de entrega para UTMify não inicia. Configure essa variável no Railway.'
              : (utmify[0]?.pending ?? 0) > 0 && !utmify[0]?.delivered
                ? 'Há entregas pendentes mas nenhuma foi entregue ainda — verifique se o worker está no ar (logs do serviço api no Railway).'
                : (utmify[0]?.dead ?? 0) > 0
                  ? 'Há entregas mortas (excederam as tentativas) — veja last_error e use o retry manual.'
                  : null,
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
               r.payload,
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
            AND e.event_name IN ('PageView', 'InitiateCheckout')
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
            COALESCE(NULLIF(attribution->>'placement', ''), 'não identificado') AS placement
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
          ad_clicks: number;
          connected_clicks: number;
          checkouts: number;
          checkout_events: number;
          orders: number;
          paid_orders: number;
          paid_buyers: number;
          upsell_orders: number;
          unmapped_paid_orders: number;
          orphan_orders: number;
          paid_revenue_minor: string;
          paid_revenue_brl_minor: string;
          unconverted_paid_orders: number;
          webhooks_received: number;
          webhooks_quarantined: number;
          utmify_deliveries_attempted: number;
          utmify_deliveries_lost: number;
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
        (SELECT count(DISTINCT e.visitor_id)::int FROM tracking_events e
          WHERE e.project_id = p.id AND e.event_name = 'AdClick'
            AND e.received_at >= ${from} AND e.received_at < ${to}) AS ad_clicks,
        (SELECT count(DISTINCT click.visitor_id)::int
          FROM tracking_events click
          WHERE click.project_id = p.id
            AND click.event_name = 'AdClick'
            AND click.received_at >= ${from} AND click.received_at < ${to}
            AND EXISTS (
              SELECT 1
              FROM tracking_events page
              WHERE page.project_id = click.project_id
                AND page.visitor_id = click.visitor_id
                AND page.event_name = 'PageView'
                AND page.received_at >= click.received_at
                AND page.received_at < click.received_at + interval '30 minutes'
            )) AS connected_clicks,
        (SELECT count(DISTINCT e.visitor_id)::int FROM tracking_events e
          WHERE e.project_id = p.id AND e.event_name = 'InitiateCheckout'
            AND e.received_at >= ${from} AND e.received_at < ${to}) AS checkouts,
        (SELECT count(*)::int FROM tracking_events e
          WHERE e.project_id = p.id AND e.event_name = 'InitiateCheckout'
            AND e.received_at >= ${from} AND e.received_at < ${to}) AS checkout_events,
        (SELECT count(*)::int FROM tracking_orders o WHERE o.project_id = p.id
          AND o.occurred_at >= ${from} AND o.occurred_at < ${to}) AS orders,
        (SELECT count(*)::int FROM tracking_orders o
          WHERE o.project_id = p.id AND o.status = 'paid'
            AND o.occurred_at >= ${from} AND o.occurred_at < ${to}) AS paid_orders,
        -- Front vs. upsell is marked explicitly per order (tracking_orders.order_kind),
        -- set from the tracking_product_kinds mapping at webhook time — not inferred
        -- from "repeat buyer within this window", which broke across date boundaries.
        (SELECT count(*)::int FROM tracking_orders o
          WHERE o.project_id = p.id AND o.status = 'paid' AND o.order_kind = 'front'
            AND o.occurred_at >= ${from} AND o.occurred_at < ${to}) AS paid_buyers,
        (SELECT count(*)::int FROM tracking_orders o
          WHERE o.project_id = p.id AND o.status = 'paid' AND o.order_kind = 'upsell'
            AND o.occurred_at >= ${from} AND o.occurred_at < ${to}) AS upsell_orders,
        (SELECT count(*)::int FROM tracking_orders o
          WHERE o.project_id = p.id AND o.status = 'paid' AND o.order_kind = 'unknown'
            AND o.occurred_at >= ${from} AND o.occurred_at < ${to}) AS unmapped_paid_orders,
        (SELECT count(*)::int FROM tracking_orders o
          WHERE o.project_id = p.id AND NULLIF(trim(o.visitor_id), '') IS NULL
            AND o.occurred_at >= ${from} AND o.occurred_at < ${to}) AS orphan_orders,
        -- Original currency (mixed): kept for backward compatibility and for
        -- reconciliation reports. The BRL-converted total is what the UI uses.
        (SELECT COALESCE(sum(o.amount_minor), 0)::text FROM tracking_orders o
          WHERE o.project_id = p.id AND o.status = 'paid'
            AND o.occurred_at >= ${from} AND o.occurred_at < ${to}) AS paid_revenue_minor,
        -- BRL total. Uses the persisted amount_brl_minor when the webhook
        -- converted at ingestion; falls back to a read-time conversion from
        -- exchange_rate_cache when the order is older than the conversion
        -- feature (or the rate service was down at ingestion). Only orders
        -- for currencies that have never been quoted appear as 0 here —
        -- those are counted in unconverted_paid_orders so the UI can flag.
        (SELECT COALESCE(sum(
            CASE
              WHEN o.amount_brl_minor IS NOT NULL THEN o.amount_brl_minor
              WHEN o.currency = 'BRL' THEN o.amount_minor
              WHEN rc.rate IS NOT NULL THEN (o.amount_minor * rc.rate)::bigint
              ELSE 0
            END
          ), 0)::text
          FROM tracking_orders o
          LEFT JOIN exchange_rate_cache rc
            ON rc.base_currency = o.currency AND rc.target_currency = 'BRL'
          WHERE o.project_id = p.id AND o.status = 'paid'
            AND o.occurred_at >= ${from} AND o.occurred_at < ${to}) AS paid_revenue_brl_minor,
        -- Orders that arrived but couldn't be converted at all (rate unknown
        -- and never cached). Zero once the rate service has quoted the
        -- currency once, even if the persisted column stays NULL.
        (SELECT count(*)::int FROM tracking_orders o
          LEFT JOIN exchange_rate_cache rc
            ON rc.base_currency = o.currency AND rc.target_currency = 'BRL'
          WHERE o.project_id = p.id AND o.status = 'paid'
            AND o.amount_minor IS NOT NULL AND o.amount_brl_minor IS NULL
            AND o.currency <> 'BRL' AND rc.rate IS NULL
            AND o.occurred_at >= ${from} AND o.occurred_at < ${to}) AS unconverted_paid_orders,
        -- Data loss rate: webhooks the Vendepay gateway sent us that we could not turn
        -- into an order (quarantined) — i.e. sales that never entered the pipeline at all.
        (SELECT count(*)::int FROM webhook_receipts r
          JOIN vendepay_connections v ON v.id = r.connection_id
          WHERE v.project_id = p.id
            AND r.received_at >= ${from} AND r.received_at < ${to}) AS webhooks_received,
        (SELECT count(*)::int FROM webhook_receipts r
          JOIN vendepay_connections v ON v.id = r.connection_id
          WHERE v.project_id = p.id AND r.state = 'quarantined'
            AND r.received_at >= ${from} AND r.received_at < ${to}) AS webhooks_quarantined,
        -- Second half of data loss: orders we DID create but that never reached UTMify
        -- (destination never configured/enabled, or delivery exhausted its retries).
        (SELECT count(*)::int FROM tracking_delivery_outbox d
          WHERE d.project_id = p.id AND d.destination_kind = 'utmify'
            AND d.created_at >= ${from} AND d.created_at < ${to}) AS utmify_deliveries_attempted,
        (SELECT count(*)::int FROM tracking_delivery_outbox d
          WHERE d.project_id = p.id AND d.destination_kind = 'utmify' AND d.state = 'dead'
            AND d.created_at >= ${from} AND d.created_at < ${to}) AS utmify_deliveries_lost
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
          ad_clicks: 0,
          connected_clicks: 0,
          checkouts: 0,
          checkout_events: 0,
          orders: 0,
          paid_orders: 0,
          paid_buyers: 0,
          upsell_orders: 0,
          unmapped_paid_orders: 0,
          orphan_orders: 0,
          paid_revenue_minor: '0',
          paid_revenue_brl_minor: '0',
          unconverted_paid_orders: 0,
          webhooks_received: 0,
          webhooks_quarantined: 0,
          utmify_deliveries_attempted: 0,
          utmify_deliveries_lost: 0,
        }),
      };
    },
  );
};

export default plugin;
