import { createHash, randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { ulid } from 'ulid';
import { env } from '../env.js';

const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.post<{ Params: { id: string } }>('/offers/:id/tracking/setup', async (req, reply) => {
    await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
    if (!app.db) {
      return reply.code(503).send({
        error: 'tracking_database_unavailable',
        detail: 'Configure DATABASE_URL e execute a migration de tracking.',
      });
    }
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
    const hash = createHash('sha256').update(webhookToken).digest('hex');
    await app.db.begin(async (sql) => {
      await sql`
        INSERT INTO tracking_projects (id, offer_id, public_key)
        VALUES (${projectId}, ${req.params.id}, ${publicKey})
      `;
      await sql`
        INSERT INTO vendepay_connections (id, project_id, token_hash)
        VALUES (${connectionId}, ${projectId}, ${hash})
      `;
    });
    const base = env.PUBLIC_BASE_URL.replace(/\/$/, '');
    return reply.code(201).send({
      project_id: projectId,
      public_key: publicKey,
      install_code: `<script async src="${base}/v1/track/t.js?key=${publicKey}"></script>`,
      vendepay_webhook_url: `${base}/v1/webhooks/vendepay?token=${webhookToken}`,
      warning: 'A URL do webhook é exibida apenas nesta criação.',
    });
  });
};

export default plugin;
