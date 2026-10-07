import cors from '@fastify/cors';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

const ALLOWED_ORIGINS_PROD = ['https://theminex.com', 'https://app.theminex.com'];
const ALLOWED_ORIGINS_DEV = ['http://localhost:3100', 'http://localhost:3000'];

function isAllowedOrigin(origin: string): boolean {
  if (ALLOWED_ORIGINS_PROD.includes(origin)) return true;
  if (process.env.NODE_ENV !== 'production' && ALLOWED_ORIGINS_DEV.includes(origin)) return true;
  return false;
}

const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin || isAllowedOrigin(origin)) {
        cb(null, true);
      } else {
        cb(new Error('CORS: origin not allowed'), false);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
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
      'content-disposition',
      'content-length',
    ],
  });
};

// Make CORS apply globally (encapsulation off) so headers reach every route,
// including those declared inside nested route prefixes like /v1/...
(plugin as unknown as Record<symbol, boolean>)[Symbol.for('skip-override')] = true;

export default plugin;
