import { buildApp } from './app.js';
import { env } from './env.js';
import { runAdsImport } from './services/ads-intelligence.js';
import { runRecoveryEmailAutomation } from './services/recovery-automation.js';
import { runSyzepayAutoClassification } from './services/syzepay-auto.js';
import { recoverTrackingDeliveries } from './services/tracking-delivery-recovery.js';
import { runVturbDeliveries } from './services/vturb.js';
import { createBundleWorker } from './workers/bundle.worker.js';
import { createExplodelyWorker } from './workers/explodely.worker.js';
import { createFunnelWorker } from './workers/funnel.worker.js';
import { createMediaWorker } from './workers/media.worker.js';
import { createMetaWorker } from './workers/meta.worker.js';
import { createPushcutDeliveryWorker } from './workers/pushcut-delivery.worker.js';
import { createRenderWorker } from './workers/render.worker.js';
import { createShieldWorker } from './workers/shield.worker.js';
import { createTikTokWorker } from './workers/tiktok.worker.js';
import { startUpsellIdentityWorker } from './workers/upsell-identity.worker.js';
import { createUtmifyDeliveryWorker } from './workers/utmify-delivery.worker.js';
import { createUtmifyWebEventWorker } from './workers/utmify-web-event.worker.js';
import { createVendepayWebhookWorker } from './workers/vendepay-webhook.worker.js';
import { createVslWorker } from './workers/vsl.worker.js';

async function main() {
  const app = await buildApp();
  // Start the financial consumer before seeding/recovering any backlog.
  // Recovery also performs network-bound FX repair and must never delay the
  // worker responsible for paid/refunded/chargeback delivery.
  const utmifyDeliveryWorker = createUtmifyDeliveryWorker();
  const tikTokWorker = createTikTokWorker();
  const explodelyWorker = createExplodelyWorker();
  await app.utmifyDeliveryQueue.resume();
  // PostgreSQL is the durable outbox. Redis may contain thousands of duplicate
  // recovery jobs from an interrupted replay, so rebuild the transient queue
  // from the database whenever a new replica takes ownership.
  await app.utmifyDeliveryQueue.drain(true);
  // Never block HTTP startup on a historical replay. A large backlog can take
  // several minutes to enqueue (and FX repair performs network calls); awaiting
  // it here makes Railway keep the previous deployment alive, so the new worker
  // that should drain the backlog never becomes the active replica.
  const trackingRecoveryStartupTimer = setTimeout(() => {
    void recoverTrackingDeliveries(app).catch((error) =>
      app.log.error({ error }, 'initial tracking delivery recovery failed'),
    );
  }, 1_000);
  trackingRecoveryStartupTimer.unref();
  const trackingRecoveryTimer = setInterval(() => {
    void recoverTrackingDeliveries(app).catch((error) =>
      app.log.error({ error }, 'tracking delivery recovery failed'),
    );
  }, 30_000);
  trackingRecoveryTimer.unref();
  let syzeAutoRunning = false;
  const syzeAutoTimer = setInterval(() => {
    if (syzeAutoRunning) return;
    syzeAutoRunning = true;
    void runSyzepayAutoClassification(
      app as unknown as Parameters<typeof runSyzepayAutoClassification>[0],
    )
      .then((result) => {
        if (result.processed || result.failed)
          app.log.info(result, 'SyzePay automatic classification');
      })
      .catch(() => app.log.error('SyzePay automatic classification cycle failed'))
      .finally(() => {
        syzeAutoRunning = false;
      });
  }, 15000);
  syzeAutoTimer.unref();
  let adsImportRunning = false;
  const adsImportTimer = setInterval(() => {
    if (adsImportRunning) return;
    adsImportRunning = true;
    void runAdsImport(app)
      .catch(() => app.log.error('Ads Intelligence import cycle failed'))
      .finally(() => {
        adsImportRunning = false;
      });
  }, 60_000);
  adsImportTimer.unref();

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

  let vturbRunning = false;
  const runVturb = async () => {
    if (vturbRunning || !app.db) return;
    vturbRunning = true;
    try {
      const result = await runVturbDeliveries(app.db);
      if (result.queued || result.sent || result.failed)
        app.log.info(result, 'vturb conversion delivery cycle completed');
    } finally {
      vturbRunning = false;
    }
  };
  const vturbStartupTimer = setTimeout(() => {
    void runVturb().catch((error) => app.log.error({ error }, 'initial vturb delivery failed'));
  }, 3_000);
  vturbStartupTimer.unref();
  const vturbTimer = setInterval(() => {
    void runVturb().catch((error) => app.log.error({ error }, 'vturb delivery cycle failed'));
  }, 30_000);
  vturbTimer.unref();

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
  const vendepayWebhookWorker = createVendepayWebhookWorker(app);
  const upsellIdentityWorker = startUpsellIdentityWorker(app);
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
  if (!tikTokWorker)
    app.log.error(
      { ...missingEnv },
      'tiktok worker did not start — Events API deliveries will not be sent',
    );
  if (!explodelyWorker)
    app.log.error(
      { DATABASE_URL: missingEnv.DATABASE_URL },
      'explodely worker did not start — webhooks will remain received',
    );

  // Receipt persistence is the durable boundary. Queue work is recoverable,
  // so a Redis outage cannot force VendePay to keep an HTTP request open.
  const recoverVendepayWebhookReceipts = async () => {
    if (!app.db) return;
    const pending = await app.db<Array<{ id: string }>>`
      SELECT id FROM webhook_receipts
      WHERE state IN ('received','failed') AND processed_at IS NULL
      ORDER BY received_at ASC
      LIMIT 250
    `;
    const slot = Math.floor(Date.now() / 300_000);
    await Promise.allSettled(
      pending.map(({ id }) =>
        app.vendepayWebhookQueue.add(
          'recover',
          { receiptId: id },
          { jobId: `${id}:recover:${slot}` },
        ),
      ),
    );
  };
  await recoverVendepayWebhookReceipts();
  const vendepayWebhookRecoveryTimer = setInterval(() => {
    void recoverVendepayWebhookReceipts().catch((error) =>
      app.log.error({ error }, 'Vendepay webhook receipt recovery failed'),
    );
  }, 30_000);
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
      clearInterval(syzeAutoTimer);
      clearInterval(adsImportTimer);
      clearTimeout(trackingRecoveryStartupTimer);
      clearInterval(vendepayWebhookRecoveryTimer);
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
      await tikTokWorker?.close();
      await explodelyWorker?.close();
      await vendepayWebhookWorker.close();
      await upsellIdentityWorker.close();
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

export { buildApp } from './app.js';
