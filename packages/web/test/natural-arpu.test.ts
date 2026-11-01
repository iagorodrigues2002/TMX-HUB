import assert from 'node:assert/strict';
import { test } from 'node:test';
import { periodArpu } from '../src/components/overview/sales-composition';

const totals = (revenue: string, customers: number, unidentified_orders = 0) => ({
  orders: 5,
  fronts: 1,
  upsells: 4,
  customers,
  unidentified_orders,
  missing_amounts: 0,
  revenue_brl_minor: revenue,
  arr_brl_minor: null,
});
const data = {
  offers: [
    {
      offer_id: 'a',
      general: totals('60000', 1),
      natural: totals('10000', 1),
      unclassified_orders: 0,
    },
    {
      offer_id: 'b',
      general: totals('20000', 3),
      natural: totals('10000', 2),
      unclassified_orders: 0,
    },
  ],
};
test('ARPU sums revenue and unique customers in scoped funnels, not per-funnel averages', () => {
  assert.equal(periodArpu(data, ['a', 'b'], 'general'), 200);
  assert.equal(periodArpu(data, ['a'], 'general'), 600);
  assert.equal(periodArpu(data, ['a', 'b'], 'natural'), 66.67);
});
test('ARPU does not invent data when a funnel or customer identity is missing', () => {
  assert.equal(periodArpu(undefined, ['a'], 'general'), null);
  assert.equal(periodArpu(data, ['missing'], 'natural'), null);
  assert.equal(
    periodArpu(
      { offers: [{ ...data.offers[0]!, natural: totals('10000', 1, 1) }] },
      ['a'],
      'natural',
    ),
    null,
  );
});
