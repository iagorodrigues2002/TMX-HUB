import { createHash } from 'node:crypto';
import { Worker } from 'bullmq';
import postgres from 'postgres';
import { env } from '../env.js';
import { assertMetaCapiAccepted } from '../integrations/meta/capi-response.js';
import { logger } from '../lib/logger.js';
import { makeRedis } from '../lib/redis.js';
import { decryptSecret } from '../lib/secret-box.js';
import { META_QUEUE_NAME, type MetaJobData } from '../queues/index.js';

const hash = (value: string) =>
  createHash('sha256').update(value.trim().toLowerCase()).digest('hex');

/**
 * Builds Meta CAPI custom_data for a Purchase event.
 * Always includes value/currency/order_id (the essentials). Adds catalog
 * fields (content_ids, contents, num_items, content_type, content_name)
 * whenever the Vendepay payload gave us a product id, so Advantage+ / DPA
 * campaigns can match this purchase back to a product in the catalog.
 * Falls back gracefully when product data is missing: essentials still
 * ship, catalog fields are simply absent.
 */
function buildPurchaseCustomData(row: {
  external_id: string;
  amount_minor: number | null;
  currency: string | null;
  product: { id?: string; name?: string; planId?: string; planName?: string } | null;
}): Record<string, unknown> {
  const value = Number(((row.amount_minor ?? 0) / 100).toFixed(2));
  const base: Record<string, unknown> = {
    order_id: row.external_id,
    value,
    currency: row.currency,
  };
  // Prefer offer/plan id when present (an "offer" in Vendepay is a specific
  // price plan, closer to a SKU); fall back to the product id.
  const contentId = row.product?.planId?.trim() || row.product?.id?.trim();
  if (!contentId) return base;
  base.content_type = 'product';
  base.content_ids = [contentId];
  base.contents = [
    {
      id: contentId,
      quantity: 1,
      item_price: value,
    },
  ];
  base.num_items = 1;
  const name = row.product?.planName?.trim() || row.product?.name?.trim();
  if (name) base.content_name = name;
  return base;
}

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
          outgoing_event_id: string | null;
          event_name: 'InitiateCheckout' | 'Purchase';
          event_at: Date;
          pixel_external_id: string;
          access_token_encrypted: string;
          external_id: string;
          amount_minor: number | null;
          currency: string | null;
          order_kind: string | null;
          product: { id?: string; name?: string; planId?: string; planName?: string } | null;
          buyer: { email?: string; phone?: string };
          paid_at: Date | null;
          visitor_id: string | null;
          event_url: string | null;
          source: {
            _fbp?: string;
            _fbc?: string;
            fbclid?: string;
            _fbclid_ts?: string;
            country?: string;
          };
          client_ip: string | null;
          user_agent: string | null;
        }>
      >`
        SELECT md.id, md.event_id, md.outgoing_event_id, md.event_name,
               COALESCE(md.event_at, direct_event.received_at,
                 o.paid_at, o.occurred_at) AS event_at,
               mp.pixel_id AS pixel_external_id,
               mp.access_token_encrypted,
               COALESCE(o.external_id, 'TMX-IC-' || md.event_id) AS external_id,
               COALESCE(o.amount_minor, 0) AS amount_minor,
               COALESCE(o.currency, 'BRL') AS currency,
               o.order_kind,
               o.product,
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
      // Second gate for upsells: the webhook route already skips creating Purchase
      // deliveries for mapped upsells, but a delivery queued while the product was
      // still 'unknown' (or re-enqueued after a recompute) would otherwise slip
      // through here once the mapping lands.
      if (row.event_name === 'Purchase' && row.order_kind === 'upsell') {
        await db`
          UPDATE meta_deliveries
          SET state = 'skipped', last_error = 'Pedido classificado como upsell; Meta recebe apenas vendas front.'
          WHERE id = ${row.id}
        `;
        logger.info(
          { deliveryId: row.id, eventId: row.outgoing_event_id ?? row.event_id },
          'meta capi purchase skipped: upsell order',
        );
        return;
      }
      let responseStatus: number | null = null;
      let responseResult: Record<string, unknown> = {};
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
        if (row.source?.country && /^[a-z]{2}$/i.test(row.source.country)) {
          userData.country = [hash(row.source.country)];
        }
        const payload: Record<string, unknown> = {
          data: [
            {
              event_name: row.event_name,
              event_time: Math.floor(new Date(row.event_at).getTime() / 1000),
              event_id: row.outgoing_event_id ?? row.event_id,
              action_source: 'website',
              ...(row.event_url ? { event_source_url: row.event_url } : {}),
              user_data: userData,
              custom_data:
                row.event_name === 'Purchase'
                  ? buildPurchaseCustomData(row)
                  : {
                      content_name: 'Checkout',
                      content_category: 'checkout',
                      content_type: 'product',
                      currency: row.currency,
                    },
            },
          ],
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
        responseStatus = response.status;
        responseResult = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        const eventsReceived = assertMetaCapiAccepted(response.status, responseResult);
        await db`
          UPDATE meta_deliveries SET attempts = attempts + 1, state = 'delivered',
            response_status = ${response.status},
            provider_event_count = ${eventsReceived},
            response = ${db.json(responseResult as never)}, last_error = NULL, delivered_at = now()
          WHERE id = ${row.id}
        `;
        logger.info(
          {
            deliveryId: row.id,
            eventId: row.outgoing_event_id ?? row.event_id,
            eventName: row.event_name,
            pixelId: row.pixel_external_id,
            eventsReceived,
          },
          'meta capi event delivered',
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await db`
          UPDATE meta_deliveries SET attempts = attempts + 1, state = 'failed',
            response_status = ${responseStatus},
            response = CASE
              WHEN ${db.json(responseResult as never)}::jsonb = '{}'::jsonb THEN response
              ELSE ${db.json(responseResult as never)}
            END,
            provider_event_count = 0,
            last_error = ${message}
          WHERE id = ${row.id}
        `;
        logger.warn(
          {
            deliveryId: row.id,
            eventId: row.outgoing_event_id ?? row.event_id,
            eventName: row.event_name,
            pixelId: row.pixel_external_id,
            responseStatus,
            error: message,
          },
          'meta capi event failed',
        );
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
