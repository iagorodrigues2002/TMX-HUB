import cors from '@fastify/cors';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  await app.register(cors, {
    // Echo the request origin (works for any client). We log every preflight
    // so we can spot a misconfigured origin in Railway logs immediately.
    origin: (origin, cb) => {
      app.log.info({ origin }, 'cors origin check');
      // Allow same-origin / curl (no Origin header) and any browser origin.
      cb(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'content-type',
      'authorization',
      'x-api-key',
      'idempotency-key',
      'if-match',
      'if-none-match',
    ],
    exposedHeaders: [
      'etag',
      'location',
      'x-ratelimit-limit',
      'x-ratelimit-remaining',
      'x-ratelimit-reset',
      'x-content-sha256',
    ],
  });
};

export default plugin;
