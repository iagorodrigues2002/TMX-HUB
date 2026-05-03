import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get('/healthz', async (_req, reply) => {
    return reply.send({ status: 'ok', uptime: process.uptime() });
  });

  app.get('/readyz', async (_req, reply) => {
    const checks: Record<string, 'ok' | 'fail'> = {};
    let healthy = true;

    try {
      const pong = await app.redis.ping();
      checks.redis = pong === 'PONG' ? 'ok' : 'fail';
      if (checks.redis === 'fail') healthy = false;
    } catch {
      checks.redis = 'fail';
      healthy = false;
    }

    try {
      await app.storage.ping();
      checks.s3 = 'ok';
    } catch {
      checks.s3 = 'fail';
      healthy = false;
    }

    return reply.code(healthy ? 200 : 503).send({
      status: healthy ? 'ok' : 'degraded',
      checks,
    });
  });
};

export default plugin;
