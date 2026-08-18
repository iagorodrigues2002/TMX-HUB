import { Worker } from 'bullmq';
import postgres from 'postgres';
import { env } from '../env.js';
import { buildPushcutNotificationPayload } from '../integrations/pushcut/notification.js';
import { logger } from '../lib/logger.js';
import { makeRedis } from '../lib/redis.js';
import { decryptSecret } from '../lib/secret-box.js';
import { PUSHCUT_QUEUE_NAME, type PushcutJobData } from '../queues/index.js';

export function createPushcutDeliveryWorker(): Worker<PushcutJobData> | null {
  if (!env.DATABASE_URL || !env.TRACKING_ENCRYPTION_KEY) return null;
  const db = postgres(env.DATABASE_URL, {
    max: 3,
    ssl: env.NODE_ENV === 'production' ? 'require' : false,
  });
  const worker = new Worker<PushcutJobData>(
    PUSHCUT_QUEUE_NAME,
    async (job) => {
      const [row] = await db<
        Array<{
          id: string;
          secret_encrypted: string;
          front_notification_name: string;
          upsell_notification_name: string | null;
          devices: string[];
          order_kind: string | null;
          buyer: { name?: string };
          amount_brl_minor: number | null;
          currency: string | null;
          country: string | null;
          product_name: string | null;
          funnel_name: string | null;
          platform_name: string | null;
        }>
      >`
        SELECT d.id, pd.secret_encrypted, pd.front_notification_name,
               pd.upsell_notification_name, pd.devices,
               o.order_kind,
               COALESCE(o.buyer, '{}'::jsonb) AS buyer,
               o.amount_brl_minor,
               COALESCE(o.currency, 'BRL') AS currency,
               o.buyer->>'country' AS country,
               o.product->>'name' AS product_name,
               d.funnel_name,
               COALESCE(gateway.name, initcap(o.provider)) AS platform_name
        FROM tracking_delivery_outbox d
        JOIN tracking_pushcut_destinations pd
          ON pd.id = d.destination_id AND pd.enabled = true
        LEFT JOIN tracking_orders o ON o.id = d.order_id
        LEFT JOIN LATERAL (
          SELECT vc.name
          FROM webhook_receipts wr
          JOIN vendepay_connections vc ON vc.id = wr.connection_id
          WHERE wr.order_id = o.id
          ORDER BY wr.received_at DESC
          LIMIT 1
        ) gateway ON true
        WHERE d.id = ${job.data.deliveryId}
          AND d.destination_kind = 'pushcut'
          AND d.state <> 'delivered'
      `;
      if (!row) return;
      let responseStatus: number | null = null;
      let responseResult: Record<string, unknown> = {};
      try {
        const kind = row.order_kind && /^upsell(?:_[2-9][0-9]*)?$/.test(row.order_kind) ? 'upsell' : 'front';
        const notificationName =
          kind === 'upsell' ? row.upsell_notification_name : row.front_notification_name;
        if (!notificationName) {
          // Destination opted out of upsell notifications (upsell_notification_name
          // is null). Not an error — just nothing to send for this delivery.
          await db`
            UPDATE tracking_delivery_outbox
            SET state = 'skipped', last_error = 'Destino não configurou notificação para upsell.'
            WHERE id = ${row.id}
          `;
          return;
        }
        await db`
          UPDATE tracking_delivery_outbox
          SET state = 'processing', attempts = attempts + 1
          WHERE id = ${row.id}
        `;
        const payload = buildPushcutNotificationPayload(
          {
            kind,
            buyerName: row.buyer.name,
            productName: row.product_name ?? undefined,
            amountBrlMinor: row.amount_brl_minor,
            currency: row.currency ?? 'BRL',
            country: row.country ?? undefined,
            funnelName: row.funnel_name ?? undefined,
            platformName: row.platform_name ?? undefined,
          },
          Array.isArray(row.devices) ? row.devices : [],
        );
        const secret = decryptSecret(row.secret_encrypted, env.TRACKING_ENCRYPTION_KEY!);
        const url = `https://api.pushcut.io/${secret}/notifications/${encodeURIComponent(notificationName)}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(15_000),
        });
        responseStatus = response.status;
        const responseText = await response.text();
        responseResult = (() => {
          if (!responseText) return {};
          try {
            return JSON.parse(responseText) as object;
          } catch {
            return { message: responseText.slice(0, 500) };
          }
        })() as Record<string, unknown>;
        if (!response.ok) {
          const detail = JSON.stringify(responseResult).slice(0, 500);
          throw new Error(`Pushcut HTTP ${response.status}${detail !== '{}' ? `: ${detail}` : ''}`);
        }
        await db`
          UPDATE tracking_delivery_outbox
          SET state = 'delivered', response_status = ${response.status},
              response = ${db.json(responseResult as never)}, last_error = NULL, delivered_at = now()
          WHERE id = ${row.id}
        `;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await db`
          UPDATE tracking_delivery_outbox
          SET state = CASE WHEN attempts >= 8 THEN 'dead' ELSE 'failed' END,
              response_status = ${responseStatus},
              response = ${db.json(responseResult as never)},
              last_error = ${message},
              next_attempt_at = now() + make_interval(secs => LEAST(3600, 5 * power(2, attempts)))
          WHERE id = ${row.id}
        `;
        throw error;
      }
    },
    {
      connection: makeRedis(env.REDIS_URL, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
      }),
      concurrency: 5,
    },
  );
  worker.on('error', (error) => logger.error({ error }, 'pushcut delivery worker error'));
  worker.on('closed', () => void db.end({ timeout: 5 }));
  return worker;
}
