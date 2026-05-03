import Fastify from 'fastify';
import { env } from './env.js';
import { logger } from './lib/logger.js';
import corsPlugin from './plugins/cors.js';
import errorHandlerPlugin from './plugins/error-handler.js';
import queuePlugin from './plugins/queue.js';
import rateLimitPlugin from './plugins/rate-limit.js';
import storagePlugin from './plugins/storage.js';
import swaggerPlugin from './plugins/swagger.js';
import routes from './routes/index.js';
import { createBundleWorker } from './workers/bundle.worker.js';
import { createRenderWorker } from './workers/render.worker.js';

// TODO(auth): Authentication is intentionally skipped for the MVP.
// The OpenAPI spec declares bearerAuth/apiKeyAuth, but no enforcement happens
// at the API layer yet. Wire up an `onRequest` hook here once we have a
// concrete auth provider; until then, treat the API as internal-only.

export async function buildApp() {
  const app = Fastify({
    loggerInstance: logger,
    bodyLimit: 5 * 1024 * 1024,
    trustProxy: true,
    disableRequestLogging: false,
  });

  // Order matters: queue first (decorates app.redis), then storage (uses redis).
  await app.register(queuePlugin);
  await app.register(storagePlugin);
  await app.register(corsPlugin);
  await app.register(rateLimitPlugin);
  await app.register(errorHandlerPlugin);
  await app.register(swaggerPlugin);
  await app.register(routes);

  return app;
}

async function main() {
  const app = await buildApp();

  // NOTE(workers): For dev simplicity we run the workers in the same Node
  // process as the HTTP server. In production these should run as separate
  // containers (one for `render`, one for `bundle`) so that browser crashes
  // or long-running renders don't impact API latency.
  const renderWorker = createRenderWorker({
    redisUrl: env.REDIS_URL,
    jobStore: app.jobStore,
    storage: app.storage,
  });
  const bundleWorker = createBundleWorker({
    redisUrl: env.REDIS_URL,
    jobStore: app.jobStore,
    storage: app.storage,
  });

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, 'shutdown initiated');
    try {
      // Stop accepting new requests first.
      await app.close();
      // Drain workers (they finish in-flight jobs).
      await renderWorker.close();
      await bundleWorker.close();
      app.log.info('shutdown complete');
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  const port = env.PORT ?? env.API_PORT;
  try {
    await app.listen({ port, host: env.API_HOST });
    app.log.info(`Page Cloner API listening on http://${env.API_HOST}:${port}`);
    app.log.info(`API docs at http://${env.API_HOST}:${port}/docs`);
  } catch (err) {
    app.log.error({ err }, 'failed to start server');
    process.exit(1);
  }
}

// Only auto-run when invoked as the entrypoint, not when imported by tests.
const invokedDirectly = (() => {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    const url = new URL(import.meta.url);
    const fileFromUrl = decodeURIComponent(url.pathname);
    return entry === fileFromUrl || entry.endsWith('server.js') || entry.endsWith('server.ts');
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  void main();
}
