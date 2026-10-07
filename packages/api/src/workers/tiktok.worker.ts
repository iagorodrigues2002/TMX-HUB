import { createHash } from 'node:crypto';
import { Worker } from 'bullmq';
import postgres from 'postgres';
import { env } from '../env.js';
import type { TikTokEventInput } from '../integrations/tiktok/contracts.js';
import { logger } from '../lib/logger.js';
import { makeRedis } from '../lib/redis.js';
import { decryptSecret } from '../lib/secret-box.js';
import { TIKTOK_QUEUE_NAME, type TikTokJobData } from '../queues/index.js';

const sha256 = (value: string) =>
  createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
export const TIKTOK_EVENTS_API_URL = 'https://business-api.tiktok.com/open_api/v1.3/event/track/';

const safeUrl = (value: string | null | undefined) => {
  try {
    return value && new URL(value).protocol.startsWith('http') ? value : 'https://theminex.com/';
  } catch {
    return 'https://theminex.com/';
  }
};

export function buildTikTokPayload(input: TikTokEventInput) {
  const user: Record<string, string> = {};
  if (input.email) user.email = sha256(input.email);
  if (input.phone) user.phone = sha256(input.phone.replace(/\D/g, ''));
  if (input.externalId) user.external_id = sha256(input.externalId);
  if (input.ttp) user.ttp = input.ttp;
  if (input.ttclid) user.ttclid = input.ttclid;
  if (input.ip) user.ip = input.ip;
  if (input.userAgent) user.user_agent = input.userAgent;
  const contentId = input.contentId || input.orderId;
  return {
    event_source: 'web',
    event_source_id: input.pixelCode,
    ...(input.testEventCode ? { test_event_code: input.testEventCode } : {}),
    data: [
      {
        event: input.eventName,
        event_time: Math.floor(input.occurredAt.getTime() / 1000),
        event_id: input.eventId,
        user,
        page: { url: input.eventUrl, ...(input.referrer ? { referrer: input.referrer } : {}) },
        properties: {
          contents: [
            {
              content_id: contentId,
              content_type: 'product',
              content_name: input.contentName || contentId,
              quantity: 1,
              price: input.value,
            },
          ],
          content_type: 'product',
          content_id: contentId,
          currency: input.currency,
          value: input.value,
          order_id: input.orderId,
        },
      },
    ],
  };
}

export function createTikTokWorker(): Worker<TikTokJobData> | null {
  if (!env.DATABASE_URL || !env.TRACKING_ENCRYPTION_KEY) return null;
  const db = postgres(env.DATABASE_URL, {
    max: 3,
    ssl: env.NODE_ENV === 'production' ? 'require' : false,
  });
  const process = async (deliveryId: string) => {
    const [row] = await db<
      Array<{
        id: string;
        event_id: string;
        event_name: 'Purchase';
        test_event_code: string | null;
        test_context: { event_url?: string | null; email?: string | null; phone?: string | null };
        attempts: number;
        pixel_code: string;
        access_token_encrypted: string;
        order_id: string | null;
        external_id: string | null;
        amount_minor: number | null;
        currency: string | null;
        amount_brl_minor: number | null;
        product: { id?: string; name?: string; planId?: string; planName?: string } | null;
        buyer: { email?: string; phone?: string };
        paid_at: Date | null;
        created_at: Date;
        visitor_id: string | null;
        event_url: string | null;
        referrer: string | null;
        source: { ttclid?: string; _ttp?: string; ttp?: string; client_ip?: string };
        client_ip: string | null;
        user_agent: string | null;
      }>
    >`
      SELECT d.id,d.event_id,d.event_name,d.test_event_code,d.test_context,d.attempts,
             dest.pixel_code,dest.access_token_encrypted,d.order_id,
             o.external_id,o.amount_minor,o.currency,o.amount_brl_minor,o.product,COALESCE(o.buyer,'{}'::jsonb) buyer,o.paid_at,o.visitor_id,
             COALESCE(event.event_url, latest.event_url) event_url,
             COALESCE(event.referrer, latest.referrer) referrer,
             COALESCE(visitor.last_source,'{}'::jsonb) || COALESCE(latest.source,'{}'::jsonb) || COALESCE(event.source,'{}'::jsonb) source,
             COALESCE(event.client_ip,latest.client_ip) client_ip,COALESCE(event.user_agent,latest.user_agent) user_agent,
             d.created_at
      FROM tracking_tiktok_deliveries d
      JOIN tracking_tiktok_destinations dest ON dest.id=d.destination_id AND dest.enabled=true
      LEFT JOIN tracking_orders o ON o.id=d.order_id
      LEFT JOIN tracking_events event ON event.project_id=d.project_id AND event.id=d.event_id
      LEFT JOIN tracking_visitors visitor ON visitor.project_id=d.project_id AND visitor.visitor_id=COALESCE(o.visitor_id,event.visitor_id)
      LEFT JOIN LATERAL (SELECT event_url,referrer,source,client_ip,user_agent FROM tracking_events te WHERE te.project_id=d.project_id AND te.visitor_id=COALESCE(o.visitor_id,event.visitor_id) ORDER BY te.received_at DESC LIMIT 1) latest ON true
      WHERE d.id=${deliveryId} AND d.state IN ('pending','failed','processing','test')
    `;
    if (!row) return;
    const minor = row.amount_brl_minor ?? row.amount_minor;
    const currency = row.amount_brl_minor != null ? 'BRL' : row.currency;
    if (!row.test_event_code && (!row.order_id || !minor || !currency || !row.paid_at))
      throw new Error('TikTok: compra aprovada sem valor, moeda ou data.');
    // TODO(LGPD consent gate): before outbound delivery, load
    // tracking_consents for the visitor. For denied consent, keep only the
    // hashed email identifier and omit phone, IP, UA, cookies and URL.
    const payload = buildTikTokPayload({
      pixelCode: row.pixel_code,
      eventId: row.event_id,
      eventName: 'Purchase',
      occurredAt: row.paid_at ?? row.created_at,
      eventUrl: safeUrl(row.test_context.event_url ?? row.event_url),
      referrer: row.referrer ?? undefined,
      value: Number(((minor ?? 1) / 100).toFixed(2)),
      currency: currency ?? 'BRL',
      orderId: row.external_id ?? `TMX-TEST-${row.id}`,
      ttclid: row.source.ttclid,
      ttp: row.source._ttp ?? row.source.ttp,
      email: row.buyer.email ?? row.test_context.email ?? undefined,
      phone: row.buyer.phone ?? row.test_context.phone ?? undefined,
      externalId: row.visitor_id ?? row.order_id ?? row.id,
      ip: row.client_ip ?? row.source.client_ip ?? undefined,
      userAgent: row.user_agent ?? undefined,
      contentId: row.product?.planId ?? row.product?.id,
      contentName: row.product?.planName ?? row.product?.name,
      testEventCode: row.test_event_code ?? undefined,
    });
    try {
      await db`UPDATE tracking_tiktok_deliveries SET state='processing',attempts=attempts+1 WHERE id=${row.id}`;
      const response = await fetch(TIKTOK_EVENTS_API_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'access-token': decryptSecret(row.access_token_encrypted, env.TRACKING_ENCRYPTION_KEY!),
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15_000),
      });
      const raw = await response.text();
      let parsed: { code?: number; message?: string; request_id?: string } = {};
      try {
        parsed = JSON.parse(raw) as typeof parsed;
      } catch {
        parsed = { message: raw.slice(0, 800) };
      }
      if (!response.ok || (parsed.code !== undefined && parsed.code !== 0))
        throw new Error(`TikTok HTTP ${response.status}: ${parsed.message ?? raw.slice(0, 500)}`);
      await db`UPDATE tracking_tiktok_deliveries SET state='delivered',response_status=${response.status},response=${db.json({ provider: parsed, payload: { event: payload.data[0]?.event, event_id: payload.data[0]?.event_id, pixel_code: payload.event_source_id, test: Boolean(row.test_event_code) } } as never)},last_error=NULL,delivered_at=now() WHERE id=${row.id}`;
      logger.info(
        { deliveryId: row.id, requestId: parsed.request_id },
        'tiktok events api delivery succeeded',
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await db`UPDATE tracking_tiktok_deliveries SET state=CASE WHEN attempts >= 6 THEN 'dead' ELSE 'failed' END,last_error=${message},next_attempt_at=now()+make_interval(secs => LEAST(3600,5*power(2,attempts))) WHERE id=${row.id}`;
      throw error;
    }
  };
  return new Worker<TikTokJobData>(TIKTOK_QUEUE_NAME, (job) => process(job.data.deliveryId), {
    connection: makeRedis(env.REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: false }),
    concurrency: 3,
  });
}
