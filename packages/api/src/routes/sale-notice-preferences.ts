import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { saleNoticeScopeKey } from '../services/sale-notice-preferences.js';

const schema = z.object({ scope: z.enum(['all', 'own']) }).strict();
export async function saleNoticePreferenceRoutes(app: FastifyInstance) {
  app.get('/tracking/sale-notice-preferences', async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: 'unauthorized' });
    if (req.user.role !== 'admin') return reply.code(403).send({ error: 'admin_required' });
    const scope = await app.redis.get(saleNoticeScopeKey(req.user.sub));
    return { scope: scope === 'own' ? 'own' : 'all' };
  });
  app.put('/tracking/sale-notice-preferences', async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: 'unauthorized' });
    if (req.user.role !== 'admin') return reply.code(403).send({ error: 'admin_required' });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_scope' });
    await app.redis.set(saleNoticeScopeKey(req.user.sub), parsed.data.scope);
    return parsed.data;
  });
}
