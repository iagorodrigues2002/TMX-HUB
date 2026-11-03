import { normalizeExplodely } from '../integrations/explodely/normalize.js';
import { normalizePaysight } from '../integrations/paysight/normalize.js';
import { normalizeVendepay } from '../integrations/vendepay/normalize.js';
import type { RefundOrder } from './refund-analytics.js';

export interface RefundDateReceipt {
  order_id: string;
  external_id: string;
  provider?: string;
  payload: unknown;
  received_at: string | Date;
}

function dateAt(payload: unknown, paths: string[]): string | undefined {
  for (const path of paths) {
    let raw: unknown = payload;
    for (const key of path.split('.'))
      raw = raw && typeof raw === 'object' ? (raw as Record<string, unknown>)[key] : undefined;
    // A timezone is mandatory: do not interpret ambiguous provider dates
    // in whatever timezone happens to be configured on the server.
    if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw))
      continue;
    const time = Date.parse(raw);
    if (Number.isFinite(time)) return new Date(time).toISOString();
  }
  return undefined;
}

/** SQL caller enforces exact order + connection + project; no fuzzy matching. */
export function recoverRefundDateEvidence(rows: RefundOrder[], receipts: RefundDateReceipt[]) {
  const evidence = new Map<
    string,
    { purchase?: string; purchaseFallback?: string; reversal?: string; received?: string }
  >();
  const earliest = (a: string | undefined, b: string | undefined) =>
    !a ? b : !b ? a : a < b ? a : b;
  for (const receipt of receipts) {
    if (!receipt.payload || typeof receipt.payload !== 'object') continue;
    const received = new Date(receipt.received_at);
    if (!Number.isFinite(received.getTime())) continue;
    const provider = receipt.provider ?? 'vendepay';
    let event: { status: string; transactionId: string } | undefined;
    if (provider === 'vendepay' || provider === 'paysight') {
      const result =
        provider === 'vendepay'
          ? normalizeVendepay(receipt.payload, received)
          : normalizePaysight(receipt.payload);
      if (result.kind === 'processable') event = result.event;
    } else if (provider === 'explodely') {
      const result = normalizeExplodely(
        receipt.payload as Record<string, unknown>,
        Buffer.from(JSON.stringify(receipt.payload)),
        received,
      );
      if (result.kind === 'processable')
        event = {
          transactionId: result.event.externalId,
          status:
            result.event.kind === 'refund'
              ? 'refunded'
              : ['sale', 'rebill'].includes(result.event.kind)
                ? 'paid'
                : result.event.kind,
        };
    }
    if (!event || event.transactionId !== receipt.external_id) continue;
    const dates = evidence.get(receipt.order_id) ?? {};
    const purchase = dateAt(receipt.payload, [
      'paid_at',
      'approved_at',
      'paidAt',
      'approvedAt',
      'data.paid_at',
      'data.approved_at',
      'order.paid_at',
    ]);
    if (event.status === 'paid') {
      dates.purchase = earliest(
        dates.purchase,
        purchase ?? dateAt(receipt.payload, ['createdAt', 'created_at', 'data.created_at']),
      );
    } else if (purchase) dates.purchaseFallback = earliest(dates.purchaseFallback, purchase);
    if (event.status === 'refunded' || event.status === 'chargeback') {
      // Real observed payloads repeat the PURCHASE createdAt on chargeback.
      // Neither createdAt nor updated_at proves the effective reversal date.
      const paths =
        event.status === 'refunded'
          ? [
              'refunded_at',
              'refundedAt',
              'refund_at',
              'data.refunded_at',
              'order.refunded_at',
              'transaction.refunded_at',
            ]
          : [
              'chargeback_at',
              'chargebackAt',
              'data.chargeback_at',
              'order.chargeback_at',
              'transaction.chargeback_at',
            ];
      dates.reversal = earliest(dates.reversal, dateAt(receipt.payload, paths));
      dates.received = earliest(dates.received, received.toISOString());
    }
    evidence.set(receipt.order_id, dates);
  }
  return rows.map((row) => {
    const dates = evidence.get(row.id);
    if (
      !row.reversal_at &&
      !dates?.received &&
      !['refunded', 'chargeback'].includes(String(row.status))
    )
      return row;
    // paid_at is persisted only on approval by the ingestion route. Retain
    // this purchase evidence when an older approved receipt is unavailable.
    const storedPurchase =
      row.paid_at && Number.isFinite(new Date(row.paid_at).getTime())
        ? new Date(row.paid_at).toISOString()
        : undefined;
    return {
      ...row,
      // The financial period is determined by receipt evidence, not paid_at,
      // provider lifecycle dates, replays, or the time this report was queried.
      stored_reversal_at: row.reversal_at,
      reversal_at: dates?.received ?? null,
      reversal_received_missing: !dates?.received,
      delay_paid_at: dates?.purchase ?? storedPurchase ?? dates?.purchaseFallback ?? null,
      delay_reversal_at: dates?.reversal ?? null,
      observed_reversal_at: dates?.received ?? null,
      reversal_date_known: Boolean(dates?.reversal),
    };
  });
}
