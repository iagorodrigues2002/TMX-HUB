import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { ulid } from 'ulid';
import { z } from 'zod';
import { env } from '../env.js';
import { encryptSecret } from '../lib/secret-box.js';

const GlobalSchema = z.object({
  name: z.string().trim().min(1).max(80).default('UTMify Geral'),
  api_token: z.string().trim().min(16).max(4096).optional(),
  endpoint_url: z.string().url().default('https://api.utmify.com.br/api-credentials/orders'),
  pixel_id: z.string().trim().regex(/^[a-f0-9]{24}$/i),
  enabled: z.boolean().default(true),
});

function assertAdmin(req: { user?: { role: string } }) {
  if (req.user?.role !== 'admin') {
    const error = new Error('Apenas administradores podem configurar a UTMify Geral.') as Error & { statusCode?: number };
    error.statusCode = 403;
    throw error;
  }
}

const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get('/utmify-global', async (req, reply) => {
    assertAdmin(req);
    if (!app.db) return reply.code(503).send({ configured: false });
    const [destination] = await app.db`
      SELECT id,name,endpoint_url,external_pixel_id AS pixel_id,enabled,
             (api_token_encrypted IS NOT NULL) AS token_configured,created_at,updated_at
      FROM tracking_utmify_destinations WHERE scope='global' LIMIT 1
    `;
    if (!destination) return reply.send({ configured: false, destination: null, stats: null });
    const [stats] = await app.db`
      SELECT
        count(*) FILTER (WHERE d.created_at>=now()-interval '7 days')::int AS orders_7d,
        count(*) FILTER (WHERE d.created_at>=now()-interval '7 days' AND d.state='delivered')::int AS orders_delivered_7d,
        count(*) FILTER (WHERE d.created_at>=now()-interval '7 days' AND d.state IN ('failed','dead'))::int AS orders_failed_7d,
        (SELECT count(*)::int FROM tracking_utmify_web_events w
         WHERE w.external_pixel_id=${destination.pixel_id} AND w.created_at>=now()-interval '7 days') AS web_events_7d,
        (SELECT count(*)::int FROM tracking_utmify_web_events w
         WHERE w.external_pixel_id=${destination.pixel_id} AND w.created_at>=now()-interval '7 days' AND w.state='delivered') AS web_events_delivered_7d
      FROM tracking_delivery_outbox d
      WHERE d.destination_kind='utmify' AND d.destination_id=${destination.id}
    `;
    return reply.send({ configured: true, destination, stats });
  });

  app.put('/utmify-global', async (req, reply) => {
    assertAdmin(req);
    if (!app.db || !env.TRACKING_ENCRYPTION_KEY) {
      return reply.code(503).send({ error: 'tracking_encryption_unavailable' });
    }
    const parsed = GlobalSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_utmify_global_config' });
    const [existing] = await app.db<{ id: string; api_token_encrypted: string | null }[]>`
      SELECT id,api_token_encrypted FROM tracking_utmify_destinations WHERE scope='global' LIMIT 1
    `;
    if (!parsed.data.api_token && !existing?.api_token_encrypted) {
      return reply.code(400).send({ error: 'utmify_api_token_required' });
    }
    const encryptedToken = parsed.data.api_token
      ? encryptSecret(parsed.data.api_token, env.TRACKING_ENCRYPTION_KEY)
      : existing!.api_token_encrypted;
    const id = existing?.id ?? ulid();
    const [destination] = existing
      ? await app.db`
          UPDATE tracking_utmify_destinations
          SET name=${parsed.data.name},api_token_encrypted=${encryptedToken},
              endpoint_url=${parsed.data.endpoint_url},external_pixel_id=${parsed.data.pixel_id},
              enabled=${parsed.data.enabled},updated_at=now()
          WHERE id=${id}
          RETURNING id,name,endpoint_url,external_pixel_id AS pixel_id,enabled,
                    true AS token_configured,created_at,updated_at
        `
      : await app.db`
          INSERT INTO tracking_utmify_destinations
            (id,project_id,name,api_token_encrypted,endpoint_url,enabled,scope,external_pixel_id)
          VALUES
            (${id},NULL,${parsed.data.name},${encryptedToken},${parsed.data.endpoint_url},
             ${parsed.data.enabled},'global',${parsed.data.pixel_id})
          RETURNING id,name,endpoint_url,external_pixel_id AS pixel_id,enabled,
                    true AS token_configured,created_at,updated_at
        `;
    return reply.send({ destination });
  });

  app.post('/utmify-global/test', async (req, reply) => {
    assertAdmin(req);
    if (!app.db) return reply.code(503).send({ error: 'database_unavailable' });
    const [destination] = await app.db<{ id: string }[]>`
      SELECT id FROM tracking_utmify_destinations WHERE scope='global' AND enabled=true LIMIT 1
    `;
    if (!destination) return reply.code(409).send({ error: 'utmify_global_not_configured' });
    const [project] = await app.db<{ id: string }[]>`
      SELECT id FROM tracking_projects WHERE enabled=true ORDER BY created_at ASC LIMIT 1
    `;
    if (!project) return reply.code(409).send({ error: 'tracking_project_missing' });
    const suffix = ulid();
    const orderId = ulid();
    const deliveryId = ulid();
    const transactionId = `TMX-GLOBAL-TEST-${suffix}`;
    await app.db.begin(async (sql) => {
      await sql`
        INSERT INTO tracking_orders
          (id,project_id,provider,external_id,status,amount_minor,currency,buyer,raw_status,
           occurred_at,payment_method,product,attribution_source)
        VALUES
          (${orderId},${project.id},'tmx-test',${transactionId},'pending',100,'BRL',
           ${sql.json({ name: 'Teste UTMify Geral', email: `utmify-geral+${suffix.toLowerCase()}@theminex.com`, phone: '5511999999999' })},
           'waiting_payment',now(),'pix',${sql.json({ id: 'tmx-global-test', name: 'Teste UTMify Geral' })},
           ${sql.json({ src: `tmx_global_test_${suffix}`, utm_source: 'tmx', utm_campaign: 'utmify_geral_test' })})
      `;
      await sql`
        INSERT INTO tracking_delivery_outbox
          (id,project_id,destination_kind,destination_id,order_id,event_id,event_type)
        VALUES
          (${deliveryId},${project.id},'utmify',${destination.id},${orderId},
           ${`tmx-global-test:${suffix}`},'order.waiting_payment.test')
      `;
    });
    await app.utmifyDeliveryQueue.add('send', { deliveryId });
    return reply.code(202).send({ accepted: true, delivery_id: deliveryId, transaction_id: transactionId });
  });
};

export default plugin;
