import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { ulid } from 'ulid';
import { env } from '../../env.js';
import { databaseUnavailable, installCode, tokenHash, webhookUrl } from './pagination-schema.js';

export function registerGetDiagnosticsRoutes(app: FastifyInstance) {
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
    await app.offerStore.assertTrackingManager(
      req.params.id,
      req.user!.sub,
      req.user!.role === 'admin',
    );
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
      if (!existing[0].connection_id) {
        const connectionId = ulid();
        const webhookToken = randomBytes(32).toString('base64url');
        await app.db`
          INSERT INTO vendepay_connections (id, project_id, token_hash)
          VALUES (${connectionId}, ${existing[0].id}, ${tokenHash(webhookToken)})
        `;
        return reply.send({
          already_configured: true,
          project_id: existing[0].id,
          public_key: existing[0].public_key,
          install_code: installCode(existing[0].public_key),
          vendepay_webhook_url: webhookUrl(webhookToken),
          warning: 'A conexão Vendepay foi reparada. A URL do webhook é exibida apenas agora.',
        });
      }
      return reply.send({
        already_configured: true,
        project_id: existing[0].id,
        public_key: existing[0].public_key,
        install_code: installCode(existing[0].public_key),
        vendepay_webhook_url: null,
        warning:
          'O tracking já estava configurado. Gere uma nova URL somente se precisar substituir o webhook na Vendepay.',
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
}
