import { Worker } from 'bullmq';
import postgres from 'postgres';
import { env } from '../env.js';
import { buildUtmifyOrderPayload } from '../integrations/utmify/sales.js';
import { logger } from '../lib/logger.js';
import { makeRedis } from '../lib/redis.js';
import { decryptSecret } from '../lib/secret-box.js';
import { UTMIFY_DELIVERY_QUEUE_NAME, type UtmifyDeliveryJobData } from '../queues/index.js';

export function createUtmifyDeliveryWorker(): Worker<UtmifyDeliveryJobData> | null {
  if (!env.DATABASE_URL || !env.TRACKING_ENCRYPTION_KEY) return null;
  const db = postgres(env.DATABASE_URL, {
    max: 3,
    ssl: env.NODE_ENV === 'production' ? 'require' : false,
  });
  const worker = new Worker<UtmifyDeliveryJobData>(
    UTMIFY_DELIVERY_QUEUE_NAME,
    async (job) => {
      const [row] = await db<
        Array<{
          id: string;
          endpoint_url: string;
          api_token_encrypted: string;
          external_id: string;
          provider: string;
          status: string;
          amount_minor: number | null;
          currency: string | null;
          buyer: {
            name?: string;
            email?: string;
            phone?: string;
            document?: string;
            country?: string;
          };
          occurred_at: Date;
          paid_at: Date | null;
          source: Record<string, string>;
          client_ip: string | null;
        }>
      >`
        SELECT d.id, u.endpoint_url, u.api_token_encrypted,
               o.external_id, o.provider, o.status, o.amount_minor, o.currency,
               o.buyer, o.occurred_at, o.paid_at,
               o.attribution_source ||
               jsonb_strip_nulls(jsonb_build_object(
                 'payment_method', o.payment_method,
                 'product_id', o.product->>'id',
                 'product_name', o.product->>'name',
                 'plan_id', o.product->>'planId',
                 'plan_name', o.product->>'planName'
               )) ||
               COALESCE((
                 SELECT te.source FROM tracking_events te
                 WHERE te.project_id = o.project_id AND te.visitor_id = o.visitor_id
                 ORDER BY te.received_at DESC LIMIT 1
               ), '{}'::jsonb) AS source,
               (
                 SELECT te.client_ip FROM tracking_events te
                 WHERE te.project_id = o.project_id AND te.visitor_id = o.visitor_id
                 ORDER BY te.received_at DESC LIMIT 1
               ) AS client_ip
        FROM tracking_delivery_outbox d
        JOIN tracking_utmify_destinations u ON u.id = d.destination_id AND u.enabled = true
        JOIN tracking_orders o ON o.id = d.order_id
        WHERE d.id = ${job.data.deliveryId}
          AND d.destination_kind = 'utmify'
          AND d.state <> 'delivered'
      `;
      if (!row) return;
      try {
        if (row.amount_minor === null || !row.currency) {
          throw new Error('Pedido sem valor ou moeda para envio à UTMify.');
        }
        await db`
          UPDATE tracking_delivery_outbox
          SET state = 'processing', attempts = attempts + 1
          WHERE id = ${row.id}
        `;
        const payload = buildUtmifyOrderPayload({
          isTest: row.provider === 'tmx-test',
          orderId: row.external_id,
          provider: row.provider,
          status: row.status,
          amountMinor: row.amount_minor,
          currency: row.currency,
          createdAt: row.occurred_at,
          paidAt: row.paid_at,
          buyer: row.buyer,
          source: row.source,
          clientIp: row.client_ip ?? (row.provider === 'tmx-test' ? '203.0.113.1' : null),
        });
        const token = decryptSecret(row.api_token_encrypted, env.TRACKING_ENCRYPTION_KEY!);
        const response = await fetch(row.endpoint_url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-token': token,
            'x-idempotency-key': row.id,
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(15_000),
        });
        const responseText = await response.text();
        const result = (() => {
          if (!responseText) return {};
          try {
            return JSON.parse(responseText) as object;
          } catch {
            return { message: responseText.slice(0, 800) };
          }
        })();
        if (!response.ok) {
          const detail = JSON.stringify(result).slice(0, 800);
          throw new Error(`UTMify HTTP ${response.status}${detail !== '{}' ? `: ${detail}` : ''}`);
        }
        await db`
          UPDATE tracking_delivery_outbox
          SET state = 'delivered', response_status = ${response.status},
              response = ${db.json(result as never)}, last_error = NULL, delivered_at = now()
          WHERE id = ${row.id}
        `;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await db`
          UPDATE tracking_delivery_outbox
          SET state = CASE WHEN attempts >= 8 THEN 'dead' ELSE 'failed' END,
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
  worker.on('error', (error) => logger.error({ error }, 'utmify delivery worker error'));
  worker.on('closed', () => void db.end({ timeout: 5 }));
  return worker;
}
