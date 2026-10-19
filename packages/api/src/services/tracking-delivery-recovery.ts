import type { FastifyInstance } from 'fastify';
import { normalizeVendepay } from '../integrations/vendepay/normalize.js';
import { convertToBrlMinor } from './exchange-rate.js';

export async function recoverTrackingDeliveries(
  app: Pick<
    FastifyInstance,
    | 'db'
    | 'utmifyDeliveryQueue'
    | 'metaQueue'
    | 'utmifyWebEventQueue'
    | 'pushcutQueue'
    | 'tiktokQueue'
  >,
) {
  if (!app.db) return;
  // Financial delivery recovery must run before any network-bound FX repair.
  // Otherwise a slow exchange-rate provider can strand paid/refunded orders
  // and abandoned-order neutralizations behind it for an entire cycle.
  await app.utmifyDeliveryQueue.resume();
  // Historical reconciliation used versioned delivery ids. Keep only the
  // newest global delivery for each durable order; older rows would send the
  // exact same current order status and waste the provider's request quota.
  await app.db`
      WITH redundant AS (
        SELECT d.id,
               row_number() OVER (
                 PARTITION BY d.destination_id,d.order_id
                 ORDER BY d.created_at DESC,d.id DESC
               ) AS position
        FROM tracking_delivery_outbox d
        JOIN tracking_utmify_destinations u
          ON u.id=d.destination_id AND u.scope='global'
        WHERE d.destination_kind='utmify'
          AND d.order_id IS NOT NULL
          AND d.state <> 'delivered'
      )
      UPDATE tracking_delivery_outbox d
      SET state='skipped',
          last_error='Entrega global histórica substituída por versão mais recente.'
      FROM redundant r
      WHERE d.id=r.id AND r.position > 1
    `;
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
        AND d.state='dead'
        AND d.last_error LIKE '%RATE_LIMIT_REACHED%'
    `;
  const urgentUtmify = await app.db<{ id: string; status: string; next_attempt_at: Date }[]>`
      SELECT d.id,COALESCE(o.status,'pending') AS status,d.next_attempt_at
      FROM tracking_delivery_outbox d
      LEFT JOIN tracking_orders o ON o.id=d.order_id
      LEFT JOIN tracking_utmify_destinations u ON u.id=d.destination_id
      WHERE d.destination_kind='utmify'
        AND d.state IN ('pending','failed','processing')
        AND d.next_attempt_at <= now()
      ORDER BY CASE
        WHEN u.scope='global'
          AND d.event_id NOT LIKE 'utmify-global-backfill:%'
          AND d.event_id NOT LIKE 'utmify-global-reconcile-%' THEN 0
        WHEN u.scope='global' AND o.status='paid' THEN 1
        WHEN u.scope='global' AND o.status IN ('refunded','chargeback') THEN 2
        WHEN u.scope='global' AND o.status='abandoned' THEN 3
        ELSE 4
      END,d.created_at ASC
      LIMIT 5000
    `;
  for (let offset = 0; offset < urgentUtmify.length; offset += 100) {
    const batch = urgentUtmify.slice(offset, offset + 100);
    await app.utmifyDeliveryQueue.addBulk(
      batch.map(({ id, status, next_attempt_at: nextAttemptAt }) => ({
        name: 'send',
        data: { deliveryId: id },
        opts: {
          // Stable while an outbox row is pending. A real failed attempt
          // changes next_attempt_at and therefore creates one fresh job.
          jobId: `outbox-${id}-${nextAttemptAt.getTime()}`,
          lifo: true,
          priority: ['paid', 'refunded', 'chargeback'].includes(status)
            ? 1
            : status === 'abandoned'
              ? 2
              : 10,
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
  await Promise.allSettled(pending.map(({ id }) => app.metaQueue.add('send', { deliveryId: id })));
  const pendingUtmifyWebEvents = await app.db<{ id: string }[]>`
      SELECT ue.id FROM tracking_utmify_web_events ue
      WHERE ue.state IN ('pending', 'failed', 'processing')
        AND next_attempt_at <= now()
        AND NOT EXISTS (
          SELECT 1
          FROM tracking_utmify_destinations d
          JOIN tracking_utmify_global_offer_routes r ON r.project_id=ue.project_id
          WHERE d.scope='global' AND d.external_pixel_id=ue.external_pixel_id
            AND r.enabled=false
        )
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
  const pendingTikTok = await app.db<{ id: string }[]>`
      SELECT id FROM tracking_tiktok_deliveries
      WHERE state IN ('pending','failed','processing','test') AND next_attempt_at<=now()
      ORDER BY created_at ASC LIMIT 1000
    `;
  await Promise.allSettled(
    pendingTikTok.map(({ id }) =>
      app.tiktokQueue.add(
        'send',
        { deliveryId: id },
        { jobId: `${id}-recovery-${Math.floor(Date.now() / 30_000)}` },
      ),
    ),
  );
}
