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
  amount_brl_minor: number | null;
  product: { id?: string; name?: string; planId?: string; planName?: string } | null;
}): Record<string, unknown> {
  // Always report in BRL when the ingestion converted successfully, so Meta's
  // ROAS lines up with the ad account (which runs in BRL). Fall back to the
  // original amount + currency only if conversion didn't happen (rate unknown
  // and never cached). This preserves the value → Meta always sees a number,
  // just occasionally in the original currency.
  const useBrl = row.amount_brl_minor != null;
  const minor = useBrl ? row.amount_brl_minor! : (row.amount_minor ?? 0);
  const value = Number((minor / 100).toFixed(2));
  const base: Record<string, unknown> = {
    order_id: row.external_id,
    value,
    currency: useBrl ? 'BRL' : row.currency,
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
          amount_brl_minor: number | null;
          order_kind: string | null;
          product: { id?: string; name?: string; planId?: string; planName?: string } | null;
          buyer: { email?: string; phone?: string; country?: string; postalCode?: string };
          identity_email: string | null;
          identity_phone: string | null;
          identity_postal_code: string | null;
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
               CASE WHEN md.order_id IS NULL THEN 0 ELSE o.amount_minor END AS amount_minor,
               CASE WHEN md.order_id IS NULL THEN 'BRL' ELSE o.currency END AS currency,
               o.amount_brl_minor,
               o.order_kind,
               o.product,
               COALESCE(o.buyer, '{}'::jsonb) AS buyer, o.paid_at,
               COALESCE(NULLIF(direct_event.properties->>'email', ''), (
                 SELECT NULLIF(te.properties->>'email', '') FROM tracking_events te
                 WHERE te.project_id = md.project_id
                   AND te.visitor_id = COALESCE(o.visitor_id, direct_event.visitor_id)
                   AND NULLIF(te.properties->>'email', '') IS NOT NULL
                 ORDER BY te.received_at DESC LIMIT 1
               )) AS identity_email,
               COALESCE(NULLIF(direct_event.properties->>'phone', ''), (
                 SELECT NULLIF(te.properties->>'phone', '') FROM tracking_events te
                 WHERE te.project_id = md.project_id
                   AND te.visitor_id = COALESCE(o.visitor_id, direct_event.visitor_id)
                   AND NULLIF(te.properties->>'phone', '') IS NOT NULL
                 ORDER BY te.received_at DESC LIMIT 1
               )) AS identity_phone,
               COALESCE(
                 NULLIF(direct_event.properties->>'postal_code', ''),
                 NULLIF(direct_event.properties->>'postalCode', ''),
                 NULLIF(direct_event.properties->>'postcode', ''),
                 NULLIF(direct_event.properties->>'zip', ''),
                 NULLIF(direct_event.properties->>'cep', ''),
                 (
                   SELECT COALESCE(
                     NULLIF(te.properties->>'postal_code', ''),
                     NULLIF(te.properties->>'postalCode', ''),
                     NULLIF(te.properties->>'postcode', ''),
                     NULLIF(te.properties->>'zip', ''),
                     NULLIF(te.properties->>'cep', '')
                   )
                   FROM tracking_events te
                   WHERE te.project_id = md.project_id
                     AND te.visitor_id = COALESCE(o.visitor_id, direct_event.visitor_id)
                     AND COALESCE(
                       NULLIF(te.properties->>'postal_code', ''),
                       NULLIF(te.properties->>'postalCode', ''),
                       NULLIF(te.properties->>'postcode', ''),
                       NULLIF(te.properties->>'zip', ''),
                       NULLIF(te.properties->>'cep', '')
                     ) IS NOT NULL
                   ORDER BY te.received_at DESC LIMIT 1
                 )
               ) AS identity_postal_code,
               COALESCE(o.visitor_id, direct_event.visitor_id) AS visitor_id,
               COALESCE(direct_event.event_url, (
                 SELECT te.event_url FROM tracking_events te
                 WHERE te.project_id = md.project_id
                   AND te.visitor_id = COALESCE(o.visitor_id, direct_event.visitor_id)
                 ORDER BY te.received_at DESC LIMIT 1
               )) AS event_url,
               COALESCE(o.attribution_source, '{}'::jsonb) ||
               COALESCE(tv.first_source, '{}'::jsonb) ||
               COALESCE(tv.last_source, '{}'::jsonb) ||
               COALESCE(direct_event.source, '{}'::jsonb) || COALESCE((
                 SELECT te.source FROM tracking_events te
                 WHERE te.project_id = md.project_id
                   AND te.visitor_id = COALESCE(o.visitor_id, direct_event.visitor_id)
                   AND te.source <> '{}'::jsonb
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
        LEFT JOIN tracking_visitors tv
          ON tv.project_id = md.project_id
         AND tv.visitor_id = COALESCE(o.visitor_id, direct_event.visitor_id)
        WHERE md.id = ${job.data.deliveryId} AND md.state <> 'delivered'
      `;
      if (!row) return;
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
        const email =
          row.buyer.email?.trim().toLowerCase() || row.identity_email?.trim().toLowerCase();
        const phone = (row.buyer.phone || row.identity_phone || '').replace(/\D/g, '');
        const postalCode = (row.buyer.postalCode || row.identity_postal_code || '')
          .trim()
          .toLowerCase()
          .replace(/[\s-]+/g, '');
        if (email) userData.em = [hash(email)];
        if (phone) userData.ph = [hash(phone)];
        if (postalCode) userData.zp = [hash(postalCode)];
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
        const country = row.buyer.country || row.source?.country;
        if (country && /^[a-z]{2}$/i.test(country)) {
          userData.country = [hash(country)];
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
