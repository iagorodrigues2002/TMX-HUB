import type { Sql } from 'postgres';
import { type RefundDateReceipt, collectRefundDateEvidence } from './refund-date-evidence.js';
import { type SalesView, saleOriginFilter } from './sale-origin.js';

/** Exact order, gateway account and project only; pending receipts are not evidence. */
export async function loadRefundDateReceipts(db: Sql, orderIds: string[]) {
  if (!orderIds.length) return [];
  return db<RefundDateReceipt[]>`
    SELECT wr.order_id,o.external_id,wr.payload,wr.received_at,
      CASE WHEN vc.payload_adapter='explodely' THEN 'explodely' ELSE o.provider END provider
    FROM webhook_receipts wr
    JOIN tracking_orders o ON o.id=wr.order_id
    JOIN vendepay_connections vc ON vc.id=wr.connection_id
      AND vc.id=o.vendepay_connection_id AND vc.project_id=o.project_id
    -- Legacy ingestion used "processable" for already-applied events.
    -- The normalizer below still verifies status and transaction identity.
    WHERE wr.order_id=ANY(${orderIds}) AND wr.state IN ('processed','processable')
    UNION ALL
    SELECT wr.order_id,o.external_id,wr.payload,wr.received_at,o.provider
    FROM tracking_gateway_webhook_receipts wr
    JOIN tracking_orders o ON o.id=wr.order_id AND o.gateway_connection_id=wr.gateway_connection_id
    JOIN tracking_gateway_connections gc ON gc.id=wr.gateway_connection_id
      AND gc.project_id=o.project_id AND gc.provider=o.provider
    WHERE wr.order_id=ANY(${orderIds}) AND wr.state='processed'
    ORDER BY received_at
  `;
}

export interface ReceivedReversals {
  refunded: string[];
  chargeback: string[];
}

/** Filter only after recovering the first confirmed receipt across ALL history.
 * A replay, provider purchase date or missing receipt must never move a refund.
 * Callers must resolve offer authorization before invoking this read-only loader.
 */
export async function loadReceivedReversals(
  db: Sql,
  offerIds: string[],
  from: Date,
  to: Date,
  salesView: SalesView = 'general',
): Promise<ReceivedReversals> {
  const selected: ReceivedReversals = { refunded: [], chargeback: [] };
  if (!offerIds.length) return selected;
  const orders = await db<{ id: string; kind: 'refunded' | 'chargeback' }[]>`
    SELECT o.id,
      CASE WHEN o.chargeback_at IS NOT NULL AND (o.refunded_at IS NULL OR o.chargeback_at<o.refunded_at)
        THEN 'chargeback' ELSE 'refunded' END kind
    FROM tracking_orders o JOIN tracking_projects p ON p.id=o.project_id
    WHERE p.offer_id=ANY(${offerIds}) AND ${saleOriginFilter(db, salesView)}
      AND (o.refunded_at IS NOT NULL OR o.chargeback_at IS NOT NULL
        OR o.status IN ('refunded','chargeback'))
  `;
  const evidence = collectRefundDateEvidence(
    await loadRefundDateReceipts(
      db,
      orders.map((order) => order.id),
    ),
  );
  // Preserve the established penalty-type policy. Only the financial date
  // changes to receipt evidence; both lifecycle markers still count once.
  const kinds = new Map(orders.map((order) => [order.id, order.kind]));
  for (const [id, dates] of evidence) {
    const kind = kinds.get(id);
    if (!dates.received || !kind) continue;
    const received = Date.parse(dates.received);
    if (received >= from.getTime() && received < to.getTime()) selected[kind].push(id);
  }
  return selected;
}
