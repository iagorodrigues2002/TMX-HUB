import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { ulid } from 'ulid';
import { z } from 'zod';
import { env } from '../env.js';
import { encryptSecret } from '../lib/secret-box.js';

const GlobalSchema = z.object({
  name: z.string().trim().min(1).max(80).default('UTMify Geral'),
  api_token: z.string().trim().min(16).max(4096).optional(),
  endpoint_url: z.string().url().default('https://api.utmify.com.br/api-credentials/orders'),
  pixel_id: z.string().trim().regex(/^[a-f0-9]{24}$/i).nullish(),
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
              endpoint_url=${parsed.data.endpoint_url},external_pixel_id=${parsed.data.pixel_id ?? null},
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
             ${parsed.data.enabled},'global',${parsed.data.pixel_id ?? null})
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
    // Pause state is persisted by BullMQ in Redis. A transient operational
    // pause must never leave financial reconciliation silently stranded.
    await app.utmifyDeliveryQueue.resume();
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

  app.post('/utmify-global/replay', async (req, reply) => {
    assertAdmin(req);
    if (!app.db) return reply.code(503).send({ error: 'database_unavailable' });
    const [destination] = await app.db<{ id: string }[]>`
      SELECT id FROM tracking_utmify_destinations WHERE scope='global' AND enabled=true LIMIT 1
    `;
    if (!destination) return reply.code(409).send({ error: 'utmify_global_not_configured' });
    await app.utmifyDeliveryQueue.resume();
    const inserted = await app.db<{ id: string }[]>`
      INSERT INTO tracking_delivery_outbox
        (id,project_id,destination_kind,destination_id,order_id,event_id,event_type,state,last_error)
      SELECT
        'UG' || upper(substr(md5('reconcile-v2:' || o.id || ':' || o.status),1,24)),
        o.project_id,'utmify',${destination.id},o.id,
        'utmify-global-reconcile-v2:' || o.id || ':' || o.status,
        'order.' || o.status || '.global_reconcile_v2',
        CASE WHEN o.status='cancelled' THEN 'skipped' ELSE 'pending' END,
        CASE WHEN o.status='cancelled' THEN 'Cancelamento não é aceito pela UTMify.' ELSE NULL END
      FROM tracking_orders o
      WHERE o.provider <> 'tmx-test'
      ON CONFLICT (destination_kind,destination_id,event_id) DO NOTHING
      RETURNING id
    `;

    // A previous bulk replay could have inserted the outbox row but failed to
    // publish its Redis job. Always recover every non-delivered global row,
    // rather than enqueueing only rows inserted by this request.
    await app.db`
      UPDATE tracking_delivery_outbox
      SET state='pending', next_attempt_at=now(), last_error=NULL
      WHERE destination_kind='utmify'
        AND destination_id=${destination.id}
        AND state NOT IN ('delivered','skipped')
    `;
    const pending = await app.db<{ id: string; status: string }[]>`
      SELECT d.id,o.status
      FROM tracking_delivery_outbox d
      JOIN tracking_orders o ON o.id=d.order_id
      WHERE d.destination_kind='utmify'
        AND d.destination_id=${destination.id}
        AND d.state NOT IN ('delivered','skipped')
      ORDER BY CASE o.status
        WHEN 'paid' THEN 1
        WHEN 'refunded' THEN 2
        WHEN 'chargeback' THEN 3
        WHEN 'refused' THEN 4
        WHEN 'abandoned' THEN 5
        ELSE 6
      END, d.created_at ASC
    `;

    let queued = 0;
    let queueFailed = 0;
    const batchSize = 50;
    const replayRunId = Date.now();
    for (let offset = 0; offset < pending.length; offset += batchSize) {
      const batch = pending.slice(offset, offset + batchSize);
      try {
        const jobs = await app.utmifyDeliveryQueue.addBulk(
          batch.map(({ id, status }) => ({
            name: 'send',
            data: { deliveryId: id },
            opts: {
              jobId: `global-replay-${replayRunId}-${id}`,
              lifo: true,
              priority: ['paid', 'refunded', 'chargeback'].includes(status) ? 1 : 10,
            },
          })),
        );
        queued += jobs.length;
      } catch (error) {
        queueFailed += batch.length;
        app.log.error({ error, offset, batchSize: batch.length }, 'utmify global replay batch enqueue failed');
      }
    }
    return reply.code(202).send({
      orders_found: inserted.length,
      inserted: inserted.length,
      recovered: pending.length,
      queued,
      queue_failed: queueFailed,
    });
  });
};

export default plugin;
