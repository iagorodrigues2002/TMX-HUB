import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { assertNavigationAccess } from '../lib/navigation-access.js';

const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get('/activity', { preHandler: (req) => app.requireAuth(req) }, async (req, reply) => {
    if (!req.user) return reply.send({ entries: [] });
    assertNavigationAccess(req.user, '/activity', 'GET');
    reply.header('cache-control', 'private, no-store');
    const entries = await app.activityStore.list(req.user.sub, 100);
    return reply.send({ entries });
  });
};

export default plugin;
