import type { Sql } from 'postgres';
import { normalizeVendepay } from '../integrations/vendepay/normalize.js';

export interface ReversalReceipt {
  order_id: string;
  external_id: string;
  payload: unknown;
  received_at: string | Date;
}

export function firstReversalReceipts(receipts: ReversalReceipt[]) {
  const dates = new Map<string, { refunded_at?: Date; chargeback_at?: Date }>();
  for (const receipt of receipts) {
    const received = new Date(receipt.received_at);
    if (!Number.isFinite(received.getTime())) continue;
    const normalized = normalizeVendepay(receipt.payload, received);
    if (normalized.kind !== 'processable' || normalized.event.transactionId !== receipt.external_id)
      continue;
    const status = normalized.event.status;
    if (status !== 'refunded' && status !== 'chargeback') continue;
    const field = status === 'refunded' ? 'refunded_at' : 'chargeback_at';
    const entry = dates.get(receipt.order_id) ?? {};
    if (!entry[field] || received < entry[field]) entry[field] = received;
    dates.set(receipt.order_id, entry);
  }
  return dates;
}

/** Repairs dates only; no status/amount/attribution edits, queues or conversion sends. */
export async function repairVendepayReversalDates(db: Sql, offerId: string, apply = false) {
  return db.begin(async (sql) => {
    // Lock before reading receipts so a concurrent lifecycle update cannot be overwritten.
    if (apply)
      await sql`SELECT o.id FROM tracking_orders o JOIN tracking_projects p ON p.id=o.project_id
      WHERE p.offer_id=${offerId} AND o.provider='vendepay' FOR UPDATE OF o`;
    const rows = await sql<ReversalReceipt[]>`
      SELECT r.order_id,o.external_id,r.payload,r.received_at
      FROM webhook_receipts r JOIN tracking_orders o ON o.id=r.order_id AND o.provider='vendepay'
      JOIN vendepay_connections c ON c.id=r.connection_id AND c.id=o.vendepay_connection_id AND c.project_id=o.project_id
      JOIN tracking_projects p ON p.id=o.project_id
      WHERE p.offer_id=${offerId} AND r.state IN ('processed','processable') AND COALESCE(c.payload_adapter,'')<>'explodely'
      ORDER BY r.received_at,r.id LIMIT 100001`;
    if (rows.length > 100000)
      throw new Error('Reversal date repair needs a smaller offer scope. Nothing changed.');
    let changed = 0;
    const dates = firstReversalReceipts(rows);
    for (const [id, evidence] of dates) {
      const refund = evidence.refunded_at ?? null;
      const charge = evidence.chargeback_at ?? null;
      // No evidence means preserve the old value, not manufacture a current timestamp.
      const matches = await sql`SELECT id FROM tracking_orders WHERE id=${id}
        AND ((${refund}::timestamptz IS NOT NULL AND refunded_at IS DISTINCT FROM ${refund})
          OR (${charge}::timestamptz IS NOT NULL AND chargeback_at IS DISTINCT FROM ${charge})) FOR UPDATE`;
      if (!matches.length) continue;
      changed++;
      if (apply)
        await sql`UPDATE tracking_orders SET refunded_at=COALESCE(${refund},refunded_at),
        chargeback_at=COALESCE(${charge},chargeback_at) WHERE id=${id}`;
    }
    return { inspected: rows.length, recognized: dates.size, changed, applied: apply };
  });
}
