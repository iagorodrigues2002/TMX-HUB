import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  formatRefundRevenuePercentage,
  overviewFinancials,
  refundRevenuePercentage,
} from '../src/lib/overview-financial';

const row = (id: string) => ({
  offer_id: id,
  gross_revenue_brl_minor: '100000',
  fees_brl_minor: '1000',
  reserve_brl_minor: '5000',
  net_revenue_brl_minor: '80000',
  net_available_brl_minor: '75000',
  refunded_revenue_brl_minor: '10000',
  chargeback_revenue_brl_minor: '5000',
  refund_chargeback_fee_brl_minor: '2700',
});

test('unifies refunds with chargebacks and adds gateway fines to total impact', () => {
  const result = overviewFinancials(['a'], [row('a'), row('not-authorized')]);
  assert.equal(result?.gross, 1000);
  assert.equal(result?.refunds, 150);
  assert.equal(result?.impact, 177);
  assert.equal(result?.refundPercentage, 15);
  assert.equal(result?.impactPercentage, 17.7);
});

test('aggregates money before computing percentages, not percentages averaged across offers', () => {
  const result = overviewFinancials(
    ['a', 'b'],
    [row('a'), { ...row('b'), gross_revenue_brl_minor: '300000' }],
  );
  assert.equal(result?.refundPercentage, 7.5);
  assert.equal(result?.impactPercentage, 8.85);
});

test('no revenue denominator or missing scope is unknown, not zero percent', () => {
  assert.equal(refundRevenuePercentage(100, 0), null);
  assert.equal(refundRevenuePercentage(0, 0), null);
  assert.equal(refundRevenuePercentage(0, 100), 0);
  assert.equal(formatRefundRevenuePercentage(null), '—');
  assert.equal(overviewFinancials(['a', 'missing'], [row('a')]), null);
});

test('old purchase refunds can exceed current-period revenue without clamping', () => {
  assert.equal(refundRevenuePercentage(150, 100), 150);
  assert.equal(formatRefundRevenuePercentage(17.7), '17,7%');
});

test('missing gateway fees suppress impact rather than understating fines', () => {
  const result = overviewFinancials(['a'], [{ ...row('a'), fees_missing_operations: 1 }]);
  assert.equal(result?.impact, null);
  assert.equal(result?.impactPercentage, null);
  assert.equal(result?.refundPercentage, 15);
  assert.equal(result?.refunds, 150);
});
