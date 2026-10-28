import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../env.js';
import { encryptSecret } from '../lib/secret-box.js';
import { assertSafeOutboundUrl } from '../lib/url-safety.js';
import {
  pushConfigured,
  pushId,
  pushSecret,
  pushSubscriptionSchema,
} from '../services/browser-push.js';

const idSchema = z.object({ id: z.string().regex(/^[a-f0-9]{64}$/) });
export async function browserPushRoutes(app: FastifyInstance) {
  app.get('/tracking/browser-push', async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: 'unauthorized' });
    const parsed = idSchema.partial().safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_device' });
    const rows =
      parsed.data.id && app.db
        ? await app.db`SELECT id FROM browser_push_subscriptions
      WHERE id=${parsed.data.id} AND user_id=${req.user.sub}`
        : [];
    return {
      configured: !!app.db && pushConfigured(),
      public_key: env.WEB_PUSH_PUBLIC_KEY ?? null,
      enabled: rows.length > 0,
    };
  });
  app.put(
    '/tracking/browser-push',
    { config: { rateLimit: { max: 10, timeWindow: 60000 } } },
    async (req, reply) => {
      if (!req.user) return reply.code(401).send({ error: 'unauthorized' });
      if (!app.db || !pushConfigured()) return reply.code(503).send({ error: 'push_unavailable' });
      const parsed = pushSubscriptionSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: 'invalid_subscription' });
      await assertSafeOutboundUrl(parsed.data.endpoint);
      const id = pushId(parsed.data.endpoint);
      const encrypted = encryptSecret(JSON.stringify(parsed.data), pushSecret());
      const rows = await app.db`INSERT INTO browser_push_subscriptions(id,user_id,secret_encrypted)
      VALUES(${id},${req.user.sub},${encrypted}) ON CONFLICT(id) DO UPDATE
      SET secret_encrypted=EXCLUDED.secret_encrypted,updated_at=now()
      WHERE browser_push_subscriptions.user_id=EXCLUDED.user_id RETURNING id`;
      if (!rows.length) return reply.code(409).send({ error: 'device_owned_by_another_user' });
      return { id, enabled: true };
    },
  );
  app.delete('/tracking/browser-push', async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: 'unauthorized' });
    const parsed = idSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_device' });
    if (app.db)
      await app.db`DELETE FROM browser_push_subscriptions WHERE id=${parsed.data.id} AND user_id=${req.user.sub}`;
    return { enabled: false };
  });
}
