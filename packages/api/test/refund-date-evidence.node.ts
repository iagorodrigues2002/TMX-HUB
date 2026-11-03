import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type RefundOrder, buildRefundAnalytics } from '../src/services/refund-analytics.js';
import {
  type RefundDateReceipt,
  recoverRefundDateEvidence,
} from '../src/services/refund-date-evidence.js';
const purchase = '2026-09-01T12:00:00.000Z';
const reversal = '2026-10-01T12:00:00.000Z';
const received = '2026-10-16T12:00:00.000Z';
const row: RefundOrder = {
  id: 'order-1',
  offer_id: 'own',
  offer_name: 'PJR_ENG',
  provider: 'vendepay',
  connection_name: 'Mainex',
  product_name: 'Front',
  paid_at: purchase,
  reversal_at: reversal,
  amount_brl_minor: 10000,
  penalty_brl_minor: 2700,
};
const receipt = (
  payload: Record<string, unknown>,
  patch: Partial<RefundDateReceipt> = {},
): RefundDateReceipt => ({
  order_id: row.id,
  external_id: 'tx-1',
  received_at: received,
  payload: { checkoutId: 'tx-1', ...payload },
  ...patch,
});
const paid = receipt(
  { event: 'compra.aprovada', status: 2, createdAt: purchase },
  { received_at: purchase },
);
const analytics = (receipts: RefundDateReceipt[]) =>
  buildRefundAnalytics(
    recoverRefundDateEvidence([row], receipts),
    '2026-10-01',
    '2026-10-16',
    'day',
    '2026-10-16',
  );
test('real Vendepay pattern: charge repeats purchase createdAt; never report false zero', () => {
  const result = analytics([
    paid,
    receipt({ event: 'chargeback', status: 2, createdAt: purchase, updated_at: purchase }),
  ]);
  assert.equal(result.effective_delay.sample_count, 0);
  assert.equal(result.effective_delay.mean_days, null);
  assert.equal(result.effective_delay.missing_reversal_at, 1);
  assert.equal(result.observed_delay.mean_days, 45);
  assert.equal(result.delay.mean_days, 45);
  assert.equal(result.delay.sample_count, 1);
  assert.equal(result.totals.brl_minor, 10000);
  assert.equal(result.totals.impact_brl_minor, 12700);
});
test('explicit actual reversal and observed receipt remain two separate measures', () => {
  const result = analytics([
    paid,
    receipt({ event: 'chargeback', createdAt: purchase, chargeback_at: reversal }),
  ]);
  assert.equal(result.effective_delay.mean_days, 30);
  assert.equal(result.observed_delay.mean_days, 45);
});
test('earliest notification wins over replays, with one reversal counted', () => {
  const charge = receipt(
    { event: 'chargeback', createdAt: purchase },
    { received_at: '2026-10-03T12:00:00Z' },
  );
  const result = analytics([paid, charge, receipt({ event: 'chargeback', createdAt: purchase })]);
  assert.equal(result.observed_delay.mean_days, 32);
  assert.equal(result.delay.mean_days, 32);
  assert.equal(result.totals.count, 1);
});
test('approved receipt outranks contradictory purchase fields on reversal', () => {
  const result = analytics([
    paid,
    receipt({ event: 'refund', paid_at: '2026-08-01T12:00:00Z', refunded_at: reversal }),
  ]);
  assert.equal(result.effective_delay.mean_days, 30);
});
test('missing, ambiguous timezone and mismatched transactions never become valid samples', () => {
  const result = analytics([
    receipt({ event: 'chargeback', createdAt: purchase, chargeback_at: '2026-10-01T12:00:00' }),
    receipt({ event: 'compra.aprovada', transaction_id: 'different', createdAt: purchase }),
  ]);
  assert.equal(result.effective_delay.sample_count, 0);
  assert.equal(result.observed_delay.sample_count, 1);
  assert.equal(result.effective_delay.missing_paid_at, 0);
});
test('same external id cannot cross order/account boundaries supplied by SQL', () => {
  const result = buildRefundAnalytics(
    recoverRefundDateEvidence(
      [{ ...row, paid_at: null }],
      [
        receipt({ event: 'compra.aprovada', createdAt: purchase }, { order_id: 'other-order' }),
        receipt({ event: 'chargeback', chargeback_at: reversal }),
      ],
    ),
    '2026-10-01',
    '2026-10-16',
    'day',
    '2026-10-16',
  );
  assert.equal(result.effective_delay.sample_count, 0);
});
test('persisted approved purchase remains evidence when its original receipt is unavailable', () => {
  const result = analytics([receipt({ event: 'chargeback', createdAt: purchase })]);
  assert.equal(result.observed_delay.mean_days, 45);
  assert.equal(result.effective_delay.mean_days, null);
  assert.equal(result.effective_delay.missing_paid_at, 0);
});
test('proof of same instant remains valid; a negative interval is excluded', () => {
  const same = analytics([paid, receipt({ event: 'refund', refunded_at: purchase })]);
  assert.equal(same.effective_delay.mean_days, 0);
  const negative = analytics([
    paid,
    receipt({ event: 'refund', refunded_at: '2026-08-01T12:00:00Z' }),
  ]);
  assert.equal(negative.effective_delay.sample_count, 0);
  assert.equal(negative.effective_delay.negative_delay_orders, 1);
});

test('financial date is first refund receipt in São Paulo, never the purchase date or a replay', () => {
  const rows = recoverRefundDateEvidence(
    [{ ...row, reversal_at: purchase }],
    [
      paid,
      receipt({ event: 'chargeback', createdAt: purchase }),
      receipt(
        { event: 'chargeback', createdAt: purchase },
        { received_at: '2026-10-16T02:30:00Z' },
      ),
    ],
  );
  assert.equal(rows[0]?.reversal_at, '2026-10-16T02:30:00.000Z');
  assert.equal(
    buildRefundAnalytics(rows, '2026-09-01', '2026-09-01', 'day', '2026-10-16').totals.count,
    0,
  );
  const refundDay = buildRefundAnalytics(rows, '2026-10-15', '2026-10-15', 'day', '2026-10-16');
  assert.equal(refundDay.totals.count, 1);
  assert.equal(refundDay.totals.impact_brl_minor, 12700);
  assert.equal(
    buildRefundAnalytics(rows, '2026-10-16', '2026-10-16', 'day', '2026-10-16').totals.count,
    0,
  );
});

test('approval-only evidence cannot date a refund; the original value remains explicitly undated', () => {
  const rows = recoverRefundDateEvidence([{ ...row, reversal_at: purchase }], [paid]);
  assert.equal(rows[0]?.reversal_at, null);
  assert.equal(rows[0]?.reversal_received_missing, true);
  assert.equal(rows[0]?.stored_reversal_at, purchase);
  assert.equal(rows[0]?.amount_brl_minor, 10000);
});

test('a confirmed refund is recovered even if the stored reversal timestamp is missing', () => {
  const rows = recoverRefundDateEvidence(
    [{ ...row, reversal_at: null, status: 'refunded' }],
    [receipt({ event: 'refund', createdAt: purchase })],
  );
  assert.equal(rows[0]?.reversal_at, received);
});

test('Paysight receipt uses the verified transaction and receipt time, not occurredAt', () => {
  const rows = recoverRefundDateEvidence(
    [{ ...row, provider: 'paysight' }],
    [
      receipt(
        { transaction_id: 'tx-1', applicationId: 200, created_at: purchase },
        { provider: 'paysight' },
      ),
    ],
  );
  assert.equal(rows[0]?.reversal_at, received);
});
