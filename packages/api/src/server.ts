import Fastify from 'fastify';
import { env } from './env.js';
import { logger } from './lib/logger.js';
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
import { createBundleWorker } from './workers/bundle.worker.js';
import { createFunnelWorker } from './workers/funnel.worker.js';
import { createMediaWorker } from './workers/media.worker.js';
import { createMetaWorker } from './workers/meta.worker.js';
import { createRenderWorker } from './workers/render.worker.js';
import { createShieldWorker } from './workers/shield.worker.js';
import { createUtmifyDeliveryWorker } from './workers/utmify-delivery.worker.js';
import { createUtmifyWebEventWorker } from './workers/utmify-web-event.worker.js';
import { createVslWorker } from './workers/vsl.worker.js';

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

  // Order matters: queue first (decorates app.redis), then storage (uses redis),
  // then auth (decorates app.userStore + activityStore + requireAuth).
  await app.register(queuePlugin);
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

async function main() {
  const app = await buildApp();
  const recoverTrackingDeliveries = async () => {
    if (!app.db) return;
    const pending = await app.db<{ id: string }[]>`
      SELECT id FROM meta_deliveries
      WHERE state IN ('pending', 'failed')
        AND attempts < 8
      ORDER BY created_at ASC
      LIMIT 1000
    `;
    await Promise.allSettled(
      pending.map(({ id }) => app.metaQueue.add('send', { deliveryId: id })),
    );
    const pendingUtmify = await app.db<{ id: string }[]>`
      SELECT id FROM tracking_delivery_outbox
      WHERE destination_kind = 'utmify'
        AND state IN ('pending', 'failed', 'processing')
        AND next_attempt_at <= now()
      ORDER BY created_at ASC
      LIMIT 1000
    `;
    await Promise.allSettled(
      pendingUtmify.map(({ id }) =>
        app.utmifyDeliveryQueue.add(
          'send',
          { deliveryId: id },
          { jobId: `${id}-recovery-${Math.floor(Date.now() / 30_000)}` },
        ),
      ),
    );
    const pendingUtmifyWebEvents = await app.db<{ id: string }[]>`
      SELECT id FROM tracking_utmify_web_events
      WHERE state IN ('pending', 'failed', 'processing')
        AND next_attempt_at <= now()
      ORDER BY created_at ASC
      LIMIT 1000
    `;
    await Promise.allSettled(
      pendingUtmifyWebEvents.map(({ id }) =>
        app.utmifyWebEventQueue.add(
          'send',
          { deliveryId: id },
          { jobId: `${id}-recovery-${Math.floor(Date.now() / 30_000)}` },
        ),
      ),
    );
  };
  await recoverTrackingDeliveries();
  const trackingRecoveryTimer = setInterval(() => {
    void recoverTrackingDeliveries().catch((error) =>
      app.log.error({ error }, 'tracking delivery recovery failed'),
    );
  }, 30_000);
  trackingRecoveryTimer.unref();

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
  const vslWorker = createVslWorker({
    redisUrl: env.REDIS_URL,
    jobStore: app.vslJobStore,
    storage: app.storage,
  });
  const funnelWorker = createFunnelWorker({
    redisUrl: env.REDIS_URL,
    jobStore: app.funnelJobStore,
    storage: app.storage,
  });
  const shieldWorker = createShieldWorker({
    redisUrl: env.REDIS_URL,
    jobStore: app.shieldJobStore,
    nicheStore: app.nicheStore,
    storage: app.storage,
  });
  const mediaWorker = createMediaWorker({
    redisUrl: env.REDIS_URL,
    jobStore: app.mediaJobStore,
    nicheStore: app.nicheStore,
    storage: app.storage,
  });
  const metaWorker = createMetaWorker();
  const utmifyDeliveryWorker = createUtmifyDeliveryWorker();
  const utmifyWebEventWorker = createUtmifyWebEventWorker();
  const missingEnv = {
    DATABASE_URL: Boolean(env.DATABASE_URL),
    TRACKING_ENCRYPTION_KEY: Boolean(env.TRACKING_ENCRYPTION_KEY),
  };
  // These workers return null instead of throwing when required env vars are
  // missing (so the API can still boot for non-tracking routes) — but a silent
  // null here means queued deliveries (Meta CAPI / UTMify orders) pile up in
  // Redis and are NEVER processed, with nothing in the logs to explain why.
  if (!metaWorker)
    app.log.error({ ...missingEnv }, 'meta worker did not start — deliveries will not be sent');
  if (!utmifyDeliveryWorker)
    app.log.error(
      { ...missingEnv },
      'utmify delivery worker did not start — sales will not be sent to UTMify',
    );
  if (!utmifyWebEventWorker)
    app.log.error(
      { DATABASE_URL: missingEnv.DATABASE_URL },
      'utmify web event worker did not start — InitiateCheckout leads will not be sent to UTMify',
    );
  app.utmifySync.start();

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, 'shutdown initiated');
    try {
      clearInterval(trackingRecoveryTimer);
      app.utmifySync.stop();
      // Stop accepting new requests first.
      await app.close();
      // Drain workers (they finish in-flight jobs).
      await renderWorker.close();
      await bundleWorker.close();
      await vslWorker.close();
      await funnelWorker.close();
      await shieldWorker.close();
      await mediaWorker.close();
      await metaWorker?.close();
      await utmifyDeliveryWorker?.close();
      await utmifyWebEventWorker?.close();
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
