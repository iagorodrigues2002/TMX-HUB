import type postgres from 'postgres';
import { env } from '../env.js';
import { decryptSecret } from '../lib/secret-box.js';
import { logger } from '../lib/logger.js';

type Sql = ReturnType<typeof postgres>;

const VTURB_ANALYTICS_BASE = 'https://analytics.vturb.net';
const conversionKeys = ['vtid', 'sck', 'sid', 'src', 'subid', 'xcod', ...Array.from({ length: 20 }, (_, index) => `sub${index + 1}`)];

export function findVturbConversionKeyInUrl(value?: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value, 'https://tmx.invalid');
    return findVturbConversionKey(Object.fromEntries(url.searchParams.entries()));
  } catch {
    const match = value.match(/(?:^|[?&])(vtid|sck|sid|src|subid|xcod|sub(?:[1-9]|1[0-9]|20))=(v3_[^&#\s]+)/i);
    return match?.[2] ? decodeURIComponent(match[2]) : null;
  }
}

export function findVturbConversionKey(source: Record<string, unknown>, preferred?: string | null) {
  const keys = preferred ? [preferred, ...conversionKeys.filter((key) => key !== preferred)] : conversionKeys;
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim().startsWith('v3_')) return value.trim();
  }
  for (const value of Object.values(source)) {
    if (typeof value === 'string' && value.trim().startsWith('v3_')) return value.trim();
  }
  return null;
}

export async function vturbAnalyticsRequest<T>(token: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${VTURB_ANALYTICS_BASE}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'X-Api-Token': token,
      'X-Api-Version': 'v1',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`VTurb Analytics HTTP ${response.status}: ${text.slice(0, 500)}`);
  return (text ? JSON.parse(text) : null) as T;
}

export async function runVturbDeliveries(db: Sql) {
  if (!env.TRACKING_ENCRYPTION_KEY) return { queued: 0, sent: 0, failed: 0 };
  const integrations = await db<Array<{ project_id: string }>>`
    SELECT project_id FROM vturb_integrations
    WHERE enabled=true AND endpoint_url IS NOT NULL AND endpoint_url <> ''
  `;
  let queued = 0;
  for (const integration of integrations) {
    const inserted = await db<Array<{ id: string }>>`
      INSERT INTO vturb_deliveries(id,project_id,order_id,state)
      SELECT 'vturb:' || o.id,o.project_id,o.id,'waiting'
      FROM tracking_orders o
      WHERE o.project_id=${integration.project_id} AND o.status='paid'
        AND o.paid_at IS NOT NULL AND o.order_kind='front'
      ON CONFLICT(project_id,order_id) DO NOTHING
      RETURNING id
    `;
    queued += inserted.length;
  }

  const rows = await db<Array<{
    id: string; attempts: number; endpoint_url: string; conversion_param: string;
    external_id: string; amount_minor: number | null; currency: string | null;
    occurred_at: Date; client_ip: string | null; product: Record<string, unknown>;
    attribution_source: Record<string, unknown>; event_source: Record<string, unknown> | null;
    checkout_href: string | null;
  }>>`
    SELECT d.id,d.attempts,i.endpoint_url,i.conversion_param,o.external_id,o.amount_minor,
      o.currency,o.occurred_at,o.product,o.attribution_source,vt.event_source,vt.checkout_href,
      (SELECT e.client_ip FROM tracking_events e
       WHERE e.project_id=o.project_id AND e.visitor_id=o.visitor_id
       ORDER BY e.received_at DESC LIMIT 1) AS client_ip
    FROM vturb_deliveries d
    JOIN vturb_integrations i ON i.project_id=d.project_id AND i.enabled=true
    JOIN tracking_orders o ON o.id=d.order_id AND o.status='paid'
    LEFT JOIN LATERAL (
      SELECT e.source AS event_source,e.properties->>'href' AS checkout_href
      FROM tracking_events e
      WHERE e.project_id=o.project_id AND e.visitor_id=o.visitor_id
        AND (e.source::text LIKE '%v3\_%' ESCAPE '\\' OR e.properties->>'href' LIKE '%v3\_%' ESCAPE '\\')
      ORDER BY e.received_at DESC LIMIT 1
    ) vt ON true
    WHERE d.state IN ('waiting','failed') AND d.next_attempt_at <= now() AND d.attempts < 8
    ORDER BY d.created_at ASC LIMIT 100
  `;
  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    const conversionKey =
      findVturbConversionKey(row.attribution_source ?? {}, row.conversion_param) ??
      findVturbConversionKey(row.event_source ?? {}, row.conversion_param) ??
      findVturbConversionKeyInUrl(row.checkout_href);
    if (!conversionKey) {
      await db`UPDATE vturb_deliveries SET state='waiting',last_error='Conversion Key v3_ ainda não encontrada',next_attempt_at=now()+interval '15 minutes' WHERE id=${row.id}`;
      continue;
    }
    try {
      await db`UPDATE vturb_deliveries SET state='processing',attempts=attempts+1,conversion_key=${conversionKey} WHERE id=${row.id}`;
      const response = await fetch(row.endpoint_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_amount_cents: row.amount_minor ?? 0,
          currency: row.currency ?? 'BRL',
          conversion_key: conversionKey,
          product_name: String(row.product?.name ?? row.product?.title ?? 'Produto'),
          category: 'initial_sale',
          order_created_at: row.occurred_at.toISOString(),
          order_ip: row.client_ip ?? undefined,
          external_id: row.external_id,
        }),
        signal: AbortSignal.timeout(20_000),
      });
      const responseBody = await response.text();
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${responseBody.slice(0, 500)}`);
      await db`UPDATE vturb_deliveries SET state='sent',sent_at=now(),last_error=NULL,response_status=${response.status},response_body=${responseBody.slice(0, 2000)} WHERE id=${row.id}`;
      sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await db`UPDATE vturb_deliveries SET state='failed',last_error=${message},next_attempt_at=now()+(LEAST(3600,5*power(2,attempts))::text||' seconds')::interval WHERE id=${row.id}`;
      logger.warn({ deliveryId: row.id, error: message }, 'vturb conversion delivery failed');
      failed += 1;
    }
  }
  return { queued, sent, failed };
}
