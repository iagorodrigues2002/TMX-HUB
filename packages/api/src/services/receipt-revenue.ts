import type { Sql } from 'postgres';
import { normalizeExplodely } from '../integrations/explodely/normalize.js';
import { normalizePaysight } from '../integrations/paysight/normalize.js';
import { normalizeVendepay } from '../integrations/vendepay/normalize.js';

export interface RevenueReceipt {
  order_id: string;
  external_id: string;
  provider: string;
  payload: unknown;
  received_at: string | Date;
  amount_brl_minor: string | null;
  order_kind?: string | null;
}

export async function receiptRevenueRows(sql: Sql, offerId: string, to: Date) {
  // Include receipts before the period so replays never become new sales.
  return sql<RevenueReceipt[]>`
    SELECT o.id AS order_id,o.external_id,o.provider,r.payload,r.received_at,o.order_kind,
      COALESCE(o.amount_brl_minor,CASE WHEN o.currency='BRL' THEN o.amount_minor END)::text AS amount_brl_minor
    FROM tracking_orders o JOIN tracking_projects p ON p.id=o.project_id
    JOIN webhook_receipts r ON r.order_id=o.id AND r.connection_id=o.vendepay_connection_id
    JOIN vendepay_connections c ON c.id=r.connection_id AND c.project_id=o.project_id
    WHERE p.offer_id=${offerId} AND r.state='processed' AND r.received_at < ${to}
    UNION ALL
    SELECT o.id,o.external_id,o.provider,r.payload,r.received_at,o.order_kind,
      COALESCE(o.amount_brl_minor,CASE WHEN o.currency='BRL' THEN o.amount_minor END)::text
    FROM tracking_orders o JOIN tracking_projects p ON p.id=o.project_id
    JOIN tracking_gateway_webhook_receipts r ON r.order_id=o.id AND r.gateway_connection_id=o.gateway_connection_id
    WHERE p.offer_id=${offerId} AND r.state='processed' AND r.received_at < ${to}
    UNION ALL
    SELECT o.id,o.external_id,'syzepay',NULL::jsonb,r.received_at,o.order_kind,
      COALESCE(o.amount_brl_minor,CASE WHEN o.currency='BRL' THEN o.amount_minor END)::text
    FROM tracking_orders o JOIN tracking_projects p ON p.id=o.project_id
    JOIN syzepay_inbox_receipts r ON r.tracking_order_id=o.id AND r.connection_id=o.syzepay_connection_id
    WHERE p.offer_id=${offerId} AND r.state='processed' AND r.received_at < ${to}
    LIMIT 20001
  `;
}

export function receiptIsPaid(row: RevenueReceipt): boolean {
  if (row.provider === 'syzepay') return true; // SQL selects only processed order.paid receipts.
  if (row.provider === 'vendepay') {
    const result = normalizeVendepay(row.payload, new Date(row.received_at));
    return (
      result.kind === 'processable' &&
      result.event.status === 'paid' &&
      result.event.transactionId === row.external_id
    );
  }
  if (row.provider === 'paysight') {
    const result = normalizePaysight(row.payload);
    return (
      result.kind === 'processable' &&
      result.event.status === 'paid' &&
      result.event.transactionId === row.external_id
    );
  }
  if (row.provider === 'explodely' && row.payload && typeof row.payload === 'object') {
    const result = normalizeExplodely(
      row.payload as Record<string, unknown>,
      Buffer.from(JSON.stringify(row.payload)),
      new Date(row.received_at),
    );
    return (
      result.kind === 'processable' &&
      ['sale', 'rebill'].includes(result.event.kind) &&
      result.event.externalId === row.external_id
    );
  }
  return false;
}

export function hourlyReceiptRevenue(rows: RevenueReceipt[], from: Date, to: Date) {
  const first = new Map<string, RevenueReceipt>();
  for (const row of rows) {
    if (!receiptIsPaid(row) || !Number.isFinite(new Date(row.received_at).getTime())) continue;
    const previous = first.get(row.order_id);
    if (!previous || new Date(row.received_at) < new Date(previous.received_at))
      first.set(row.order_id, row);
  }
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, sales: 0, revenue_brl_minor: 0 }));
  const series = () => ({
    missing_currency: 0,
    hours: Array.from({ length: 24 }, (_, hour) => ({ hour, sales: 0, revenue_brl_minor: 0 })),
  });
  const by_kind = { front: series(), upsell: series(), unknown: series() };
  let missing_currency = 0;
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    hourCycle: 'h23',
  });
  for (const row of first.values()) {
    const received = new Date(row.received_at);
    if (received < from || received >= to) continue;
    const kind =
      row.order_kind === 'front' || row.order_kind === 'upsell' ? row.order_kind : 'unknown';
    const classified = by_kind[kind];
    const amount = row.amount_brl_minor === null ? Number.NaN : Number(row.amount_brl_minor);
    if (!Number.isSafeInteger(amount) || amount < 0) {
      missing_currency++;
      classified.missing_currency++;
      continue;
    }
    const bucket = hours[Number(formatter.format(received))]!;
    bucket.sales++;
    bucket.revenue_brl_minor += amount;
    classified.hours[bucket.hour]!.sales++;
    classified.hours[bucket.hour]!.revenue_brl_minor += amount;
  }
  return {
    time_zone: 'America/Sao_Paulo',
    basis: 'first_paid_webhook_received',
    missing_currency,
    hours,
    by_kind,
  };
}
