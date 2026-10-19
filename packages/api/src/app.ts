import { constants } from 'node:zlib';
import compress from '@fastify/compress';
import Fastify from 'fastify';
import { logger } from './lib/logger.js';
import analyticsCachePlugin from './plugins/analytics-cache.js';
import authPlugin from './plugins/auth.js';
import corsPlugin from './plugins/cors.js';
import databasePlugin from './plugins/database.js';
import errorHandlerPlugin from './plugins/error-handler.js';
import multipartPlugin from './plugins/multipart.js';
import queuePlugin from './plugins/queue.js';
import rateLimitPlugin from './plugins/rate-limit.js';
import storagePlugin from './plugins/storage.js';
import swaggerPlugin from './plugins/swagger.js';
import routes from './routes/index.js';

// TODO(auth): Authentication is intentionally skipped for the MVP.
// The OpenAPI spec declares bearerAuth/apiKeyAuth, but no enforcement happens
// at the API layer yet. Wire up an `onRequest` hook here once we have a
// concrete auth provider; until then, treat the API as internal-only.

export async function buildApp() {
  const app = Fastify({
    loggerInstance: logger,
    bodyLimit: 5 * 1024 * 1024,
    trustProxy: true,
    disableRequestLogging: process.env.NODE_ENV === 'production',
  });

  await app.register(compress, {
    global: true,
    encodings: ['br', 'gzip', 'deflate'],
    threshold: 1024,
    brotliOptions: {
      params: { [constants.BROTLI_PARAM_QUALITY]: 4 },
    },
  });

  // Order matters: queue first (decorates app.redis), then storage (uses redis),
  // then auth (decorates app.userStore + activityStore + requireAuth).
  await app.register(queuePlugin);
  await app.register(analyticsCachePlugin);
  await app.register(databasePlugin);
  await app.register(storagePlugin);
  await app.register(authPlugin);
  await app.register(corsPlugin);
  await app.register(rateLimitPlugin);
  await app.register(errorHandlerPlugin);
  await app.register(multipartPlugin);
  await app.register(swaggerPlugin);
  await app.register(routes);

  return app;
}
