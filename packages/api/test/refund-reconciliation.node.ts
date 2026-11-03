import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type RefundOrder, buildRefundAnalytics } from '../src/services/refund-analytics.js';

const order = (id: string, origin: string, amount: number): RefundOrder => ({
  id,
  offer_id: 'tmx',
  offer_name: 'PJR_ENG',
  provider: 'vendepay',
  connection_name: 'Mainex',
  product_name: 'Front',
  origin,
  paid_at: '2026-09-01T12:00:00Z',
  reversal_at: '2026-10-16T12:00:00Z',
  amount_brl_minor: amount,
  penalty_brl_minor: 2700,
});

test('general reconciles exactly with natural, assisted and explicitly indeterminate origins', () => {
  const rows = [
    order('natural', 'natural', 25800),
    order('assisted', 'assisted', 10000),
    order('unknown', 'unknown', 15800),
  ];
  const report = buildRefundAnalytics(rows, '2026-10-01', '2026-10-31', 'day', '2026-10-31');
  assert.ok(report.origin_totals, 'origin reconciliation must be present');
  for (const field of [
    'count',
    'brl_minor',
    'fee_brl_minor',
    'impact_brl_minor',
    'sales',
    'gross_brl_minor',
  ] as const) {
    assert.equal(
      report.origin_totals.general[field],
      report.origin_totals.natural[field] +
        report.origin_totals.assisted[field] +
        report.origin_totals.unknown[field],
    );
  }
  assert.equal(report.origin_totals.unknown.brl_minor, 15800);
  assert.equal(report.origin_totals.natural.brl_minor, 25800);
});

test('undated refunds remain visible separately, never assigned to a purchase day or counted twice', () => {
  const report = buildRefundAnalytics(
    [
      order('dated', 'natural', 10000),
      {
        ...order('no-receipt', 'unknown', 7900),
        reversal_at: null,
        reversal_received_missing: true,
      },
    ],
    '2026-10-01',
    '2026-10-31',
    'day',
    '2026-10-31',
  );
  assert.equal(report.totals.count, 1);
  assert.ok(report.undated_refunds, 'missing receipt values must not disappear silently');
  assert.equal(report.undated_refunds.count, 1);
  assert.equal(report.undated_refunds.brl_minor, 7900);
  assert.equal(report.undated_refunds.fee_brl_minor, 2700);
  assert.equal(report.undated_refunds.impact_brl_minor, 10600);
});
