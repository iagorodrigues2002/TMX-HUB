import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get(
    '/activity',
    { preHandler: (req) => app.requireAuth(req) },
    async (req, reply) => {
      if (!req.user) return reply.send({ entries: [] });
      const entries = await app.activityStore.list(req.user.sub, 100);
      return reply.send({ entries });
    },
  );
};

export default plugin;
