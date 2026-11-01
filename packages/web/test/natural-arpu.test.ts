import assert from 'node:assert/strict';
import { test } from 'node:test';
import { periodArpu } from '../src/components/overview/sales-composition';

const totals = (revenue: string, customers: number, unidentified_orders = 0, fronts = 1) => ({
  orders: 5,
  fronts,
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
      general: totals('60000', 2),
      natural: totals('10000', 1),
      unclassified_orders: 0,
    },
    {
      offer_id: 'b',
      general: totals('20000', 3, 0, 3),
      natural: totals('10000', 2),
      unclassified_orders: 0,
    },
  ],
};
test('general ARPU divides all revenue by front purchases; natural keeps unique customers', () => {
  assert.equal(periodArpu(data, ['a', 'b'], 'general'), 200);
  assert.equal(periodArpu(data, ['a'], 'general'), 600);
  assert.equal(periodArpu(data, ['a', 'b'], 'natural'), 66.67);
});
test('general ARPU matches gross revenue divided by fronts, including upsell-only offers', () => {
  const offers = [
    { ...data.offers[0]!, general: totals('2501506', 96, 0, 78) },
    { ...data.offers[1]!, general: totals('187048', 2, 0, 0) },
  ];
  assert.equal(periodArpu({ offers }, ['a', 'b'], 'general'), 344.69);
  assert.equal(periodArpu({ offers }, ['b'], 'general'), null);
});
test('general ARPU needs front counts and money, not customer identities', () => {
  const general = totals('60000', 0, 5, 2);
  const offers = [{ ...data.offers[0]!, general }];
  assert.equal(periodArpu({ offers }, ['a'], 'general'), 300);
  assert.equal(
    periodArpu(
      { offers: [{ ...offers[0]!, general: { ...general, missing_amounts: 1 } }] },
      ['a'],
      'general',
    ),
    null,
  );
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
