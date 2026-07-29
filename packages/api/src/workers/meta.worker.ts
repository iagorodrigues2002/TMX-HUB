import { createHash } from 'node:crypto';
import { Worker } from 'bullmq';
import postgres from 'postgres';
import { env } from '../env.js';
import { logger } from '../lib/logger.js';
import { makeRedis } from '../lib/redis.js';
import { decryptSecret } from '../lib/secret-box.js';
import { META_QUEUE_NAME, type MetaJobData } from '../queues/index.js';

const hash = (value: string) =>
  createHash('sha256').update(value.trim().toLowerCase()).digest('hex');

export function createMetaWorker(): Worker<MetaJobData> | null {
  if (!env.DATABASE_URL || !env.TRACKING_ENCRYPTION_KEY) return null;
  const db = postgres(env.DATABASE_URL, {
    max: 3,
    ssl: env.NODE_ENV === 'production' ? 'require' : false,
  });
  const worker = new Worker<MetaJobData>(
    META_QUEUE_NAME,
    async (job) => {
      const [row] = await db<
        Array<{
          id: string;
          event_id: string;
          event_name: 'InitiateCheckout' | 'Purchase';
          event_at: Date;
          pixel_external_id: string;
          access_token_encrypted: string;
          test_event_code: string | null;
          external_id: string;
          amount_minor: number | null;
          currency: string | null;
          buyer: { email?: string; phone?: string };
          paid_at: Date | null;
          visitor_id: string | null;
          event_url: string | null;
          source: { _fbp?: string; _fbc?: string; fbclid?: string; _fbclid_ts?: string };
          client_ip: string | null;
          user_agent: string | null;
        }>
      >`
        SELECT md.id, md.event_id, md.event_name, COALESCE(md.event_at, direct_event.received_at,
                 o.paid_at, o.occurred_at) AS event_at,
               mp.pixel_id AS pixel_external_id,
               mp.access_token_encrypted, mp.test_event_code,
               COALESCE(o.external_id, 'TMX-IC-' || md.event_id) AS external_id,
               COALESCE(o.amount_minor, 0) AS amount_minor,
               COALESCE(o.currency, 'BRL') AS currency,
               COALESCE(o.buyer, '{}'::jsonb) AS buyer, o.paid_at,
               COALESCE(o.visitor_id, direct_event.visitor_id) AS visitor_id,
               COALESCE(direct_event.event_url, (
                 SELECT te.event_url FROM tracking_events te
                 WHERE te.project_id = md.project_id
                   AND te.visitor_id = COALESCE(o.visitor_id, direct_event.visitor_id)
                 ORDER BY te.received_at DESC LIMIT 1
               )) AS event_url,
               COALESCE(o.attribution_source, '{}'::jsonb) ||
               COALESCE(direct_event.source, '{}'::jsonb) || COALESCE((
                 SELECT te.source FROM tracking_events te
                 WHERE te.project_id = md.project_id
                   AND te.visitor_id = COALESCE(o.visitor_id, direct_event.visitor_id)
                 ORDER BY te.received_at DESC LIMIT 1
               ), '{}'::jsonb) AS source,
               COALESCE(direct_event.client_ip, (
                 SELECT te.client_ip FROM tracking_events te
                 WHERE te.project_id = md.project_id
                   AND te.visitor_id = COALESCE(o.visitor_id, direct_event.visitor_id)
                 ORDER BY te.received_at DESC LIMIT 1
               )) AS client_ip,
               COALESCE(direct_event.user_agent, (
                 SELECT te.user_agent FROM tracking_events te
                 WHERE te.project_id = md.project_id
                   AND te.visitor_id = COALESCE(o.visitor_id, direct_event.visitor_id)
                 ORDER BY te.received_at DESC LIMIT 1
               )) AS user_agent
        FROM meta_deliveries md
        JOIN meta_pixels mp ON mp.id = md.pixel_id AND mp.enabled = true
        LEFT JOIN tracking_orders o ON o.id = md.order_id
        LEFT JOIN tracking_events direct_event
          ON direct_event.project_id = md.project_id AND direct_event.id = md.event_id
        WHERE md.id = ${job.data.deliveryId} AND md.state <> 'delivered'
      `;
      if (!row) return;
      try {
        if (
          row.event_name === 'Purchase' &&
          (row.amount_minor === null || !row.currency || !row.paid_at)
        ) {
          throw new Error('Purchase incompleto: valor, moeda ou data de pagamento ausente.');
        }
        const userData: Record<string, string | string[]> = {};
        if (row.buyer.email) userData.em = [hash(row.buyer.email)];
        if (row.buyer.phone) userData.ph = [hash(row.buyer.phone.replace(/\D/g, ''))];
        if (row.visitor_id) userData.external_id = [hash(row.visitor_id)];
        if (row.source?._fbp) userData.fbp = row.source._fbp;
        if (row.source?._fbc) userData.fbc = row.source._fbc;
        if (!row.source?._fbc && row.source?.fbclid) {
          const clickTime = Number(row.source._fbclid_ts);
          const timestamp = Number.isFinite(clickTime)
            ? clickTime
            : new Date(row.event_at).getTime();
          userData.fbc = `fb.1.${timestamp}.${row.source.fbclid}`;
        }
        if (row.client_ip) userData.client_ip_address = row.client_ip;
        if (row.user_agent) userData.client_user_agent = row.user_agent;
        const payload: Record<string, unknown> = {
          data: [
            {
              event_name: row.event_name,
              event_time: Math.floor(new Date(row.event_at).getTime() / 1000),
              event_id: row.event_id,
              action_source: 'website',
              ...(row.event_url ? { event_source_url: row.event_url } : {}),
              user_data: userData,
              custom_data:
                row.event_name === 'Purchase'
                  ? {
                      order_id: row.external_id,
                      value: (row.amount_minor ?? 0) / 100,
                      currency: row.currency,
                    }
                  : {
                      content_name: 'Checkout',
                      currency: row.currency,
                    },
            },
          ],
          ...(row.test_event_code ? { test_event_code: row.test_event_code } : {}),
          partner_agent: 'tmxhub-1.0',
        };
        const token = decryptSecret(row.access_token_encrypted, env.TRACKING_ENCRYPTION_KEY!);
        const url = new URL(
          `https://graph.facebook.com/${env.META_GRAPH_API_VERSION}/${row.pixel_external_id}/events`,
        );
        url.searchParams.set('access_token', token);
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(15_000),
        });
        const result = (await response.json().catch(() => ({}))) as object;
        if (!response.ok) throw new Error(`Meta HTTP ${response.status}`);
        await db`
          UPDATE meta_deliveries SET attempts = attempts + 1, state = 'delivered',
            response = ${db.json(result as never)}, last_error = NULL, delivered_at = now()
          WHERE id = ${row.id}
        `;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await db`
          UPDATE meta_deliveries SET attempts = attempts + 1, state = 'failed',
            last_error = ${message}
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
  worker.on('error', (error) => logger.error({ error }, 'meta worker error'));
  worker.on('closed', () => void db.end({ timeout: 5 }));
  return worker;
}
