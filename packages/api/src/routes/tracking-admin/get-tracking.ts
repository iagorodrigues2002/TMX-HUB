import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { ulid } from 'ulid';
import { env } from '../../env.js';
import { NotFoundError, zodToProblem } from '../../lib/problem.js';
import { encryptSecret } from '../../lib/secret-box.js';
import {
  GatewayConnectionSchema,
  GatewayConnectionUpdateSchema,
  VendepayConnectionSchema,
  databaseUnavailable,
  gatewayWebhookUrl,
  installCode,
  tokenHash,
  webhookUrl,
} from './pagination-schema.js';

export function registerGetTrackingRoutes(app: FastifyInstance) {
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
      }>
    >`
      SELECT p.id, p.public_key, p.enabled, p.created_at, p.updated_at
      FROM tracking_projects p
      WHERE p.offer_id = ${req.params.id}
      LIMIT 1
    `;
    if (!project) {
      return {
        configured: false,
        offer_id: req.params.id,
      };
    }
    const connections = await app.db<
      Array<{
        id: string;
        name: string;
        enabled: boolean;
        propagation_param: string;
        created_at: Date;
        signing_secret_configured: boolean;
      }>
    >`
      SELECT id, name, enabled, propagation_param, created_at,
             (signing_secret_encrypted IS NOT NULL) AS signing_secret_configured
      FROM vendepay_connections
      WHERE project_id = ${project.id}
      ORDER BY created_at ASC
    `;
    const primaryConnection = connections[0];
    const gateways = await app.db<
      Array<{
        id: string;
        provider: string;
        name: string;
        enabled: boolean;
        settings: Record<string, unknown>;
        fee_settings: Record<string, unknown>;
        api_key_configured: boolean;
        signing_secret_configured: boolean;
        last_validated_at: Date | null;
        last_webhook_at: Date | null;
        created_at: Date;
      }>
    >`
      SELECT id,provider,name,enabled,settings,fee_settings,
             (api_key_encrypted IS NOT NULL) AS api_key_configured,
             (signing_secret_encrypted IS NOT NULL) AS signing_secret_configured,
             last_validated_at,last_webhook_at,created_at
      FROM tracking_gateway_connections WHERE project_id=${project.id} ORDER BY created_at ASC
    `;
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
        configured: connections.length > 0,
        enabled: connections.some((connection) => connection.enabled),
        propagation_param: primaryConnection?.propagation_param ?? 'src',
        created_at: primaryConnection?.created_at ?? null,
        signing_secret_configured: connections.some(
          (connection) => connection.signing_secret_configured,
        ),
        connections,
      },
      gateways,
    };
  });

  app.post<{ Params: { id: string } }>(
    '/offers/:id/tracking/gateway-connections',
    async (req, reply) => {
      await app.offerStore.assertTrackingManager(
        req.params.id,
        req.user!.sub,
        req.user!.role === 'admin',
      );
      if (!app.db || !env.TRACKING_ENCRYPTION_KEY)
        return reply.code(503).send({ error: 'tracking_encryption_unavailable' });
      const parsed = GatewayConnectionSchema.safeParse(req.body);
      if (!parsed.success) throw zodToProblem(parsed.error);
      // Explodely's global account selectors affect routing outside this offer.
      if (parsed.data.provider === 'explodely' && req.user!.role !== 'admin') {
        return reply.code(403).send({ error: 'global_gateway_mapping_requires_admin' });
      }
      const [project] = await app.db<
        { id: string }[]
      >`SELECT id FROM tracking_projects WHERE offer_id=${req.params.id} LIMIT 1`;
      if (!project) throw new NotFoundError('Ative o tracking antes de adicionar um gateway.');
      const token = randomBytes(32).toString('base64url');
      const settings = {
        product_id: parsed.data.product_id ?? null,
        vendor_id: parsed.data.vendor_id ?? null,
        seller_id: parsed.data.seller_id ?? null,
        currency: parsed.data.currency ?? null,
        amount_unit: parsed.data.amount_unit,
        amount_scale: parsed.data.amount_scale,
        environment: parsed.data.environment,
      };
      const [connection] = await app.db<Array<Record<string, unknown>>>`
      INSERT INTO tracking_gateway_connections
        (id,project_id,provider,name,webhook_token_hash,api_key_encrypted,signing_secret_encrypted,settings)
      VALUES (${ulid()},${project.id},${parsed.data.provider},${parsed.data.name},${tokenHash(token)},
        ${parsed.data.api_key ? encryptSecret(parsed.data.api_key, env.TRACKING_ENCRYPTION_KEY) : null},
        ${parsed.data.signing_secret ? encryptSecret(parsed.data.signing_secret, env.TRACKING_ENCRYPTION_KEY) : null},
        ${app.db.json(settings)})
      ON CONFLICT(project_id,provider) DO UPDATE SET
        name=EXCLUDED.name, webhook_token_hash=EXCLUDED.webhook_token_hash,
        api_key_encrypted=COALESCE(EXCLUDED.api_key_encrypted,tracking_gateway_connections.api_key_encrypted),
        signing_secret_encrypted=COALESCE(EXCLUDED.signing_secret_encrypted,tracking_gateway_connections.signing_secret_encrypted),
        settings=EXCLUDED.settings, updated_at=now()
      RETURNING id,provider,name,enabled,settings,created_at
    `;
      return reply.code(201).send({
        connection,
        webhook_url: gatewayWebhookUrl(parsed.data.provider, token),
        warning: 'Copie agora a URL do webhook. Ela não será exibida novamente.',
      });
    },
  );

  app.patch<{ Params: { id: string; connectionId: string } }>(
    '/offers/:id/tracking/gateway-connections/:connectionId',
    async (req, reply) => {
      await app.offerStore.assertTrackingManager(
        req.params.id,
        req.user!.sub,
        req.user!.role === 'admin',
      );
      if (!app.db || !env.TRACKING_ENCRYPTION_KEY)
        return reply.code(503).send({ error: 'tracking_encryption_unavailable' });
      const parsed = GatewayConnectionUpdateSchema.safeParse(req.body);
      if (!parsed.success) throw zodToProblem(parsed.error);
      if (
        req.user!.role !== 'admin' &&
        (parsed.data.vendor_id !== undefined || parsed.data.seller_id !== undefined)
      ) {
        const [target] = await app.db<{ provider: string }[]>`
          SELECT g.provider FROM tracking_gateway_connections g
          JOIN tracking_projects p ON p.id=g.project_id
          WHERE g.id=${req.params.connectionId} AND p.offer_id=${req.params.id}
        `;
        if (target?.provider === 'explodely') {
          return reply.code(403).send({ error: 'global_gateway_mapping_requires_admin' });
        }
      }
      const [connection] = await app.db`
      UPDATE tracking_gateway_connections g SET
        name=COALESCE(${parsed.data.name ?? null},g.name),
        api_key_encrypted=COALESCE(${parsed.data.api_key ? encryptSecret(parsed.data.api_key, env.TRACKING_ENCRYPTION_KEY) : null},g.api_key_encrypted),
        signing_secret_encrypted=COALESCE(${parsed.data.signing_secret ? encryptSecret(parsed.data.signing_secret, env.TRACKING_ENCRYPTION_KEY) : null},g.signing_secret_encrypted),
        settings=g.settings || ${app.db.json({
          ...(parsed.data.product_id !== undefined ? { product_id: parsed.data.product_id } : {}),
          ...(parsed.data.vendor_id !== undefined ? { vendor_id: parsed.data.vendor_id } : {}),
          ...(parsed.data.seller_id !== undefined ? { seller_id: parsed.data.seller_id } : {}),
          ...(parsed.data.currency !== undefined ? { currency: parsed.data.currency } : {}),
          ...(parsed.data.amount_unit !== undefined
            ? { amount_unit: parsed.data.amount_unit }
            : {}),
          ...(parsed.data.amount_scale !== undefined
            ? { amount_scale: parsed.data.amount_scale }
            : {}),
          ...(parsed.data.environment !== undefined
            ? { environment: parsed.data.environment }
            : {}),
        })}, updated_at=now()
      FROM tracking_projects p WHERE g.project_id=p.id AND p.offer_id=${req.params.id}
        AND g.id=${req.params.connectionId} AND g.provider IN ('paysight','explodely')
      RETURNING g.id,g.provider,g.name,g.enabled,g.settings,
        (g.api_key_encrypted IS NOT NULL) AS api_key_configured,
        (g.signing_secret_encrypted IS NOT NULL) AS signing_secret_configured
    `;
      if (!connection) throw new NotFoundError('Conexão de gateway não encontrada.');
      return { connection };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/offers/:id/tracking/vendepay/connections',
    async (req, reply) => {
      await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db) return reply.code(503).send(databaseUnavailable);
      const parsed = VendepayConnectionSchema.safeParse(req.body);
      if (!parsed.success) throw zodToProblem(parsed.error);
      const [project] = await app.db<{ id: string }[]>`
        SELECT id FROM tracking_projects WHERE offer_id = ${req.params.id} LIMIT 1
      `;
      if (!project) throw new NotFoundError('Ative o tracking antes de adicionar uma conta.');
      const token = randomBytes(32).toString('base64url');
      const [connection] = await app.db<
        Array<{
          id: string;
          name: string;
          enabled: boolean;
          propagation_param: string;
          created_at: Date;
        }>
      >`
        INSERT INTO vendepay_connections (id, project_id, name, token_hash)
        VALUES (${ulid()}, ${project.id}, ${parsed.data.name}, ${tokenHash(token)})
        RETURNING id, name, enabled, propagation_param, created_at
      `;
      return reply.code(201).send({
        connection: { ...connection, signing_secret_configured: false },
        vendepay_webhook_url: webhookUrl(token),
        warning: 'Copie agora: esta URL secreta será exibida somente nesta criação.',
      });
    },
  );
}
