import assert from 'node:assert/strict';
import { test } from 'node:test';
import { funnelRates } from '../src/lib/funnel-rates';
test('uses linked visitors and computes complementary loss and total rates', () => {
  assert.deepEqual(funnelRates(100, 40, 10), { advances: [40, 25], losses: [60, 75], total: 10 });
});
test('zero denominator is unknown, not a fabricated conversion', () => {
  assert.deepEqual(funnelRates(0, 0, 0), {
    advances: [null, null],
    losses: [null, null],
    total: null,
  });
  assert.deepEqual(funnelRates(100, 0, 0), { advances: [0, null], losses: [100, null], total: 0 });
});
test('rejects mixed aggregate counts, invalid numbers and negative inputs', () => {
  for (const values of [
    [10, 20, 5],
    [10, 5, 6],
    [-1, 0, 0],
    [Number.NaN, 0, 0],
  ])
    assert.equal(funnelRates(values[0]!, values[1]!, values[2]!), null);
});
