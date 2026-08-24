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
import { normalizeVendepay } from './integrations/vendepay/normalize.js';
import { convertToBrlMinor } from './services/exchange-rate.js';
import { runRecoveryEmailAutomation } from './services/recovery-automation.js';
import { createBundleWorker } from './workers/bundle.worker.js';
import { createFunnelWorker } from './workers/funnel.worker.js';
import { createMediaWorker } from './workers/media.worker.js';
import { createMetaWorker } from './workers/meta.worker.js';
import { createPushcutDeliveryWorker } from './workers/pushcut-delivery.worker.js';
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
  // Start the financial consumer before seeding/recovering any backlog.
  // Recovery also performs network-bound FX repair and must never delay the
  // worker responsible for paid/refunded/chargeback delivery.
  const utmifyDeliveryWorker = createUtmifyDeliveryWorker();
  await app.utmifyDeliveryQueue.resume();
  const recoverTrackingDeliveries = async () => {
    if (!app.db) return;
    // Financial delivery recovery must run before any network-bound FX repair.
    // Otherwise a slow exchange-rate provider can strand paid/refunded orders
    // and abandoned-order neutralizations behind it for an entire cycle.
    await app.utmifyDeliveryQueue.resume();
    // A historical replay can exceed UTMify's per-token request rate. Those
    // responses are transient, so never leave an order permanently dead only
    // because all BullMQ retries happened inside the provider's rate window.
    await app.db`
      UPDATE tracking_delivery_outbox d
      SET state='failed', attempts=0, next_attempt_at=now(),
          last_error='RATE_LIMIT_REACHED: aguardando reenvio controlado'
      FROM tracking_utmify_destinations u
      WHERE u.id=d.destination_id
        AND d.destination_kind='utmify'
        AND d.state IN ('dead','failed')
        AND d.last_error LIKE '%RATE_LIMIT_REACHED%'
    `;
    const urgentUtmify = await app.db<{ id: string; status: string }[]>`
      SELECT d.id,COALESCE(o.status,'pending') AS status
      FROM tracking_delivery_outbox d
      LEFT JOIN tracking_orders o ON o.id=d.order_id
      LEFT JOIN tracking_utmify_destinations u ON u.id=d.destination_id
      WHERE d.destination_kind='utmify'
        AND d.state IN ('pending','failed','processing')
        AND d.next_attempt_at <= now()
      ORDER BY CASE
        WHEN u.scope='global' AND o.status='paid' THEN 1
        WHEN u.scope='global' AND o.status IN ('refunded','chargeback') THEN 2
        WHEN u.scope='global' AND o.status='abandoned' THEN 3
        ELSE 4
      END,d.created_at ASC
      LIMIT 5000
    `;
    const recoveryRunId = Date.now();
    for (let offset = 0; offset < urgentUtmify.length; offset += 100) {
      const batch = urgentUtmify.slice(offset, offset + 100);
      await app.utmifyDeliveryQueue.addBulk(
        batch.map(({ id, status }) => ({
          name: 'send',
          data: { deliveryId: id },
          opts: {
            jobId: `urgent-${recoveryRunId}-${id}`,
            lifo: true,
            priority: ['paid','refunded','chargeback'].includes(status) ? 1 : status === 'abandoned' ? 2 : 10,
          },
        })),
      );
    }
    // Repair recent paid orders that reached us before a new Vendepay
    // proprietary currency code was mapped (or while the FX provider was
    // temporarily unavailable). This makes accounting self-healing instead
    // of requiring an operator to replay an already-deduplicated webhook.
    const incompleteOrders = await app.db<
      Array<{
        id: string;
        amount_minor: number | null;
        currency: string | null;
        payload: unknown;
      }>
    >`
      SELECT o.id,o.amount_minor,o.currency,r.payload
      FROM tracking_orders o
      LEFT JOIN webhook_receipts r ON r.order_id=o.id
      WHERE o.paid_at >= now() - interval '30 days'
        AND o.amount_minor IS NOT NULL
        AND (o.currency IS NULL OR o.amount_brl_minor IS NULL)
      ORDER BY o.paid_at DESC
      LIMIT 100
    `;
    for (const order of incompleteOrders) {
      const normalized = order.payload ? normalizeVendepay(order.payload) : null;
      const currency =
        order.currency ??
        (normalized?.kind === 'processable' ? (normalized.event.currency ?? null) : null);
      const amountMinor =
        normalized?.kind === 'processable'
          ? (normalized.event.amountMinor ?? order.amount_minor)
          : order.amount_minor;
      if (!currency || amountMinor == null) continue;
      const converted = await convertToBrlMinor(amountMinor, currency, app.db);
      if (!converted) continue;
      await app.db`
        UPDATE tracking_orders
        SET currency=${currency},amount_minor=${amountMinor},
            amount_brl_minor=${converted.brlMinor},exchange_rate=${converted.rate},
            converted_at=now()
        WHERE id=${order.id}
      `;
    }
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
    const pendingPushcut = await app.db<{ id: string }[]>`
      SELECT id FROM tracking_delivery_outbox
      WHERE destination_kind = 'pushcut'
        AND state IN ('pending', 'failed', 'processing')
        AND next_attempt_at <= now()
      ORDER BY created_at ASC
      LIMIT 1000
    `;
    await Promise.allSettled(
      pendingPushcut.map(({ id }) =>
        app.pushcutQueue.add(
          'send',
          { deliveryId: id },
          { jobId: `${id}-recovery-${Math.floor(Date.now() / 30_000)}` },
        ),
      ),
    );
  };
  // Never block HTTP startup on a historical replay. A large backlog can take
  // several minutes to enqueue (and FX repair performs network calls); awaiting
  // it here makes Railway keep the previous deployment alive, so the new worker
  // that should drain the backlog never becomes the active replica.
  const trackingRecoveryStartupTimer = setTimeout(() => {
    void recoverTrackingDeliveries().catch((error) =>
      app.log.error({ error }, 'initial tracking delivery recovery failed'),
    );
  }, 1_000);
  trackingRecoveryStartupTimer.unref();
  const trackingRecoveryTimer = setInterval(() => {
    void recoverTrackingDeliveries().catch((error) =>
      app.log.error({ error }, 'tracking delivery recovery failed'),
    );
  }, 30_000);
  trackingRecoveryTimer.unref();

  let emailRecoveryRunning = false;
  const runEmailRecovery = async () => {
    if (emailRecoveryRunning) return;
    emailRecoveryRunning = true;
    try {
      const result = await runRecoveryEmailAutomation(app);
      if (result.created || result.sent || result.failed)
        app.log.info(result, 'recovery email automation cycle completed');
    } finally {
      emailRecoveryRunning = false;
    }
  };
  // Recovery can involve provider calls and historical reconciliation. Never
  // block API startup/login or let a recovery failure crash the HTTP service.
  const emailRecoveryStartupTimer = setTimeout(() => {
    void runEmailRecovery().catch((error) =>
      app.log.error({ error }, 'initial recovery email automation failed'),
    );
  }, 5_000);
  emailRecoveryStartupTimer.unref();
  const emailRecoveryTimer = setInterval(() => {
    void runEmailRecovery().catch((error) =>
      app.log.error({ error }, 'recovery email automation failed'),
    );
  }, 30_000);
  emailRecoveryTimer.unref();

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
  const utmifyWebEventWorker = createUtmifyWebEventWorker();
  const pushcutDeliveryWorker = createPushcutDeliveryWorker();
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
  if (!pushcutDeliveryWorker)
    app.log.error(
      { ...missingEnv },
      'pushcut delivery worker did not start — sale notifications will not be sent',
    );
  // Disabled intentionally: this legacy dashboard importer authenticates with
  // the operator's UTMify login/password once per configured offer. Besides
  // being unnecessary for server-side order/event delivery (which uses the
  // API key workers above), it can trigger repeated 429/401 login attempts.
  // Manual synchronization remains available when explicitly requested.

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, 'shutdown initiated');
    try {
      clearInterval(trackingRecoveryTimer);
      clearTimeout(trackingRecoveryStartupTimer);
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
      await pushcutDeliveryWorker?.close();
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
