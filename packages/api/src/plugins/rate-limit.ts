import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  await app.register(rateLimit, {
    max: 600,
    timeWindow: '1 minute',
    redis: app.redis,
    nameSpace: 'rl:',
    skipOnError: true,
    addHeaders: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
      'retry-after': true,
    },
    keyGenerator: (req) => {
      const apiKey = req.headers['x-api-key'];
      if (typeof apiKey === 'string' && apiKey.length > 0) return `key:${apiKey}`;
      return `ip:${req.ip}`;
    },
  });
};

export default plugin;
