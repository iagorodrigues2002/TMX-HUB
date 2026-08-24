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
  let rateLimitedUntil = 0;
  const processDelivery = async (deliveryId: string) => {
      if (Date.now() < rateLimitedUntil) return;
      const [row] = await db<
        Array<{
          id: string;
          event_type: string;
          attempts: number;
          endpoint_url: string;
          api_token_encrypted: string;
          external_id: string;
          provider: string;
          status: string;
          amount_minor: number | null;
          currency: string | null;
          amount_brl_minor: number | null;
          buyer: {
            name?: string;
            email?: string;
            phone?: string;
            document?: string;
            country?: string;
          };
          occurred_at: Date;
          paid_at: Date | null;
          lifecycle_at: Date | null;
          source: Record<string, string>;
          client_ip: string | null;
        }>
      >`
        SELECT d.id, d.event_type, d.attempts, u.endpoint_url, u.api_token_encrypted,
               COALESCE(o.external_id, 'TMX-IC-' || d.event_id) AS external_id,
               COALESCE(o.provider, 'tmx') AS provider,
               COALESCE(o.status, 'pending') AS status,
               CASE WHEN d.order_id IS NULL THEN 0 ELSE o.amount_minor END AS amount_minor,
               CASE WHEN d.order_id IS NULL THEN 'BRL' ELSE o.currency END AS currency,
               o.amount_brl_minor,
               COALESCE(o.buyer, '{}'::jsonb) AS buyer,
               COALESCE(o.occurred_at, direct_event.received_at, d.created_at) AS occurred_at,
               o.paid_at,
               COALESCE(o.chargeback_at, o.refunded_at) AS lifecycle_at,
               COALESCE(o.attribution_source, '{}'::jsonb) ||
               jsonb_strip_nulls(jsonb_build_object(
                 'payment_method', COALESCE(o.payment_method, 'pix'),
                 'product_id', o.product->>'id',
                 'product_name', o.product->>'name',
                 'plan_id', o.product->>'planId',
                 'plan_name', o.product->>'planName'
               )) ||
               COALESCE(direct_event.source, '{}'::jsonb) ||
               COALESCE((
                 SELECT te.source FROM tracking_events te
                 WHERE te.project_id = d.project_id
                   AND te.visitor_id = COALESCE(o.visitor_id, direct_event.visitor_id)
                 ORDER BY te.received_at DESC LIMIT 1
               ), '{}'::jsonb) AS source,
               COALESCE(direct_event.client_ip, (
                 SELECT te.client_ip FROM tracking_events te
                 WHERE te.project_id = d.project_id
                   AND te.visitor_id = COALESCE(o.visitor_id, direct_event.visitor_id)
                 ORDER BY te.received_at DESC LIMIT 1
               )) AS client_ip
        FROM tracking_delivery_outbox d
        JOIN tracking_utmify_destinations u ON u.id = d.destination_id AND u.enabled = true
        LEFT JOIN tracking_orders o ON o.id = d.order_id
        LEFT JOIN tracking_events direct_event
          ON direct_event.project_id = d.project_id AND direct_event.id = d.event_id
        WHERE d.id = ${deliveryId}
          AND d.destination_kind = 'utmify'
          AND d.state IN ('pending','failed','processing')
      `;
      if (!row) return;
      // UTMify rejects any status outside {waiting_payment, paid, refused,
      // refunded, chargedback} with HTTP 400. Cancelled orders (Vendepay's
      // "carrinho.abandonado") don't have a receipient status, so instead
      // of burning 8 retry attempts hitting a wall, mark the delivery as
      // skipped up front. Refunded/chargeback still flow.
      if (row.status === 'cancelled') {
        await db`
          UPDATE tracking_delivery_outbox
          SET state = 'skipped',
              last_error = 'Status cancelled não é aceito pela UTMify (aceita apenas waiting_payment, paid, refused, refunded, chargedback).'
          WHERE id = ${row.id}
        `;
        logger.info(
          { deliveryId: row.id, transactionId: row.external_id },
          'utmify delivery skipped: cancelled status not accepted by UTMify',
        );
        return;
      }
      try {
        if (row.amount_minor === null || !row.currency) {
          throw new Error('Pedido sem valor ou moeda para envio à UTMify.');
        }
        await db`
          UPDATE tracking_delivery_outbox
          SET state = 'processing', attempts = attempts + 1
          WHERE id = ${row.id}
        `;
        // Always report in BRL when the ingestion converted successfully.
        // UTMify aggregates in one currency per dashboard, and the operator's
        // dashboards are all BRL. If conversion didn't happen (rate unknown),
        // we fall back to the original amount + currency.
        const useBrl = row.amount_brl_minor != null;
        const outboundMinor = useBrl ? row.amount_brl_minor! : row.amount_minor;
        const outboundCurrency = useBrl ? 'BRL' : row.currency;
        const payload = buildUtmifyOrderPayload({
          isTest: row.provider === 'tmx-test',
          orderId: row.external_id,
          provider: row.provider,
          status:
            row.event_type === 'event.initiate_checkout.neutralize' || row.status === 'abandoned'
              ? 'refused'
              : row.status,
          amountMinor: outboundMinor,
          currency: outboundCurrency,
          createdAt: row.occurred_at,
          paidAt: row.paid_at,
          refundedAt: row.lifecycle_at,
          buyer: row.buyer,
          source: row.source,
          // UTMify rejects checkout records without an IP. Legacy ICs created before IP
          // persistence use a documentation-only address; new events keep the real req.ip.
          clientIp: row.client_ip ?? '203.0.113.1',
        });
        const token = decryptSecret(row.api_token_encrypted, env.TRACKING_ENCRYPTION_KEY!);
        const response = await fetch(row.endpoint_url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-token': token,
            // Attempts counter is part of the key so a forced resend (via
            // the resend-paid endpoint) presents a fresh idempotency-key to
            // UTMify instead of getting the cached success response.
            'x-idempotency-key': `${row.id}:${row.event_type}:${row.attempts}`,
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
        if (message.includes('RATE_LIMIT_REACHED') || message.includes('UTMify HTTP 429'))
          rateLimitedUntil = Date.now() + 120_000;
        await db`
          UPDATE tracking_delivery_outbox
          SET state = CASE WHEN attempts >= 8 THEN 'dead' ELSE 'failed' END,
              last_error = ${message},
              next_attempt_at = now() + make_interval(secs => LEAST(3600, 5 * power(2, attempts)))
          WHERE id = ${row.id}
        `;
        throw error;
      }
  };
  const worker = new Worker<UtmifyDeliveryJobData>(
    UTMIFY_DELIVERY_QUEUE_NAME,
    async (job) => processDelivery(job.data.deliveryId),
    {
      connection: makeRedis(env.REDIS_URL, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
      }),
      // UTMify applies a strict token-level rate limit. A concurrency-only
      // setting still creates bursts, so pace the whole queue explicitly.
      concurrency: 1,
      limiter: { max: 1, duration: 60_000 },
    },
  );
  let pumpRunning = false;
  const pump = async () => {
    if (pumpRunning || Date.now() < rateLimitedUntil) return;
    pumpRunning = true;
    try {
      const [candidate] = await db<{ id: string }[]>`
        WITH candidate AS (
          SELECT d.id
          FROM tracking_delivery_outbox d
          LEFT JOIN tracking_orders o ON o.id=d.order_id
          LEFT JOIN tracking_utmify_destinations u ON u.id=d.destination_id
          WHERE d.destination_kind='utmify'
            AND d.state IN ('pending','failed')
            AND d.next_attempt_at <= now()
          ORDER BY CASE
            WHEN u.scope='global' AND o.status='paid' THEN 1
            WHEN u.scope='global' AND o.status IN ('refunded','chargeback') THEN 2
            WHEN u.scope='global' AND o.status IN ('abandoned','refused') THEN 3
            ELSE 4
          END,d.created_at ASC
          FOR UPDATE OF d SKIP LOCKED
          LIMIT 1
        )
        UPDATE tracking_delivery_outbox d
        SET state='processing'
        FROM candidate
        WHERE d.id=candidate.id
        RETURNING d.id
      `;
      if (candidate) await processDelivery(candidate.id);
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error) },
        'utmify database delivery pump error',
      );
    } finally {
      pumpRunning = false;
    }
  };
  void pump();
  const pumpTimer = setInterval(() => void pump(), 2_100);
  pumpTimer.unref();
  worker.on('error', (error) => logger.error({ error }, 'utmify delivery worker error'));
  worker.on('closed', () => {
    clearInterval(pumpTimer);
    void db.end({ timeout: 5 });
  });
  return worker;
}
