import cors from '@fastify/cors';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  await app.register(cors, {
    // Echo any origin. We accept all clients (browser CORS already enforces
    // the host model on the user side; the API itself is authenticated separately).
    origin: true,
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

// Make CORS apply globally (encapsulation off) so headers reach every route,
// including those declared inside nested route prefixes like /v1/...
(plugin as unknown as Record<symbol, boolean>)[Symbol.for('skip-override')] = true;

export default plugin;
