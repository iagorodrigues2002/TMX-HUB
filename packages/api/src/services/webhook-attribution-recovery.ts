import type postgres from 'postgres';
import { normalizePaysight } from '../integrations/paysight/normalize.js';
import { normalizeAdAttribution } from '../lib/ad-attribution.js';

const attributionKeys = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'campaign_id',
  'campaign_name',
  'adset_id',
  'adset_name',
  'ad_id',
  'ad_name',
  'placement',
  'site_source_name',
  'fbclid',
  'fbc',
  'fbp',
  '_fbc',
  '_fbp',
  '_fbclid_ts',
  'gclid',
  'wbraid',
  'gbraid',
  'ttclid',
  'ttp',
  '_ttp',
];

export function recoverableWebhookSource(
  externalId: string,
  before: Record<string, string>,
  payload: unknown,
): Record<string, string> | null {
  if (attributionKeys.some((key) => before[key])) return null;
  const normalized = normalizePaysight(payload);
  if (
    normalized.kind !== 'processable' ||
    normalized.event.status !== 'paid' ||
    normalized.event.transactionId !== externalId
  )
    return null;
  const source = normalizeAdAttribution(normalized.event.source);
  const recovered = Object.fromEntries(
    attributionKeys.filter((key) => source[key]).map((key) => [key, source[key]!]),
  );
  return Object.keys(recovered).length ? { ...before, ...recovered } : null;
}

/** Maintenance only: never enqueues deliveries or changes an order/event identifier. */
export async function recoverWebhookAttribution(db: postgres.Sql, apply = false) {
  const rows = await db<
    {
      id: string;
      external_id: string;
      project_id: string;
      attribution_source: Record<string, string>;
      receipt_id: string;
      payload: unknown;
    }[]
  >`
    SELECT o.id,o.external_id,o.project_id,o.attribution_source,r.id AS receipt_id,r.payload
    FROM tracking_orders o
    JOIN tracking_gateway_webhook_receipts r
      ON r.order_id=o.id AND r.gateway_connection_id=o.gateway_connection_id
    WHERE o.provider='paysight' AND o.status IN ('paid','refunded','chargeback')
      AND o.attribution_locked_at IS NOT NULL AND o.attribution_event_id IS NULL
      AND r.received_at <= o.attribution_locked_at
    ORDER BY o.id,r.received_at,r.id LIMIT 2001`;
  if (rows.length > 2000) throw new Error('Recovery exceeds reviewed batch limit');
  const plans = new Map<
    string,
    {
      id: string;
      receipt_id: string;
      before: Record<string, string>;
      after: Record<string, string>;
    }
  >();
  for (const row of rows) {
    if (plans.has(row.id)) continue;
    const after = recoverableWebhookSource(
      row.external_id,
      row.attribution_source ?? {},
      row.payload,
    );
    if (after)
      plans.set(row.id, {
        id: row.id,
        receipt_id: row.receipt_id,
        before: row.attribution_source ?? {},
        after,
      });
  }
  const result = { candidates: plans.size, updated: 0, deliveriesCreated: 0 };
  if (!apply || !plans.size) return result;
  await db.begin(async (sql) => {
    await sql`SET LOCAL lock_timeout='3s'`;
    await sql`SET LOCAL statement_timeout='15s'`;
    // Exclusive lock + transaction: workers cannot observe an unlocked snapshot.
    // Any failure rolls back both data changes and the trigger state.
    await sql`ALTER TABLE tracking_orders DISABLE TRIGGER tracking_orders_freeze_attribution`;
    const updated = await sql`
      WITH plan AS (
        SELECT * FROM jsonb_to_recordset(${sql.json([...plans.values()])})
          AS p(id text,receipt_id text,before jsonb,after jsonb)
      ), changed AS (
        UPDATE tracking_orders o SET attribution_source=p.after
        FROM plan p WHERE o.id=p.id AND o.provider='paysight'
          AND o.attribution_locked_at IS NOT NULL AND o.attribution_event_id IS NULL
          AND o.attribution_source=p.before
          AND NOT EXISTS(SELECT 1 FROM tracking_attribution_repairs a WHERE a.order_id=o.id)
        RETURNING o.id,p.receipt_id,p.before,p.after
      )
      INSERT INTO tracking_attribution_repairs(order_id,receipt_id,source_before,source_after)
      SELECT id,receipt_id,before,after FROM changed RETURNING order_id`;
    await sql`ALTER TABLE tracking_orders ENABLE TRIGGER tracking_orders_freeze_attribution`;
    result.updated = updated.length;
  });
  return result;
}
