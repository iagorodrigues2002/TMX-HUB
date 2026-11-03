import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildDatasets,
  hasCompleteOverviewScope,
} from '../src/components/overview/overview-dashboard-build-datasets';
import type {
  OfferDescriptor,
  TrackingSummaryView,
} from '../src/components/overview/overview-dashboard-support';
import type { TrackingOverviewOffer } from '../src/lib/api-client';

const offer = (id: string, ownerId = 'tmx', currency = 'BRL'): OfferDescriptor => ({
  id,
  name: id,
  ownerId,
  ownerName: ownerId,
  currency,
});

const summary = (gross: string, paid: number): TrackingSummaryView => ({
  date: '2026-07-26:2026-11-03',
  time_zone: 'America/Sao_Paulo',
  events: 0,
  visitors: 0,
  page_views: 100,
  ad_clicks: 80,
  connected_clicks: 0,
  checkouts: 10,
  checkout_events: 10,
  orders: paid,
  paid_orders: paid,
  failed_orders: 0,
  paid_buyers: paid,
  upsell_orders: 0,
  upsell_2_orders: 0,
  upsell_3_orders: 0,
  unmapped_paid_orders: 0,
  orphan_orders: 0,
  paid_revenue_minor: gross,
  paid_revenue_brl_minor: gross,
  paid_revenue_usd_minor: '0',
  unconverted_paid_orders: 0,
  refunded_orders: 0,
  refunded_revenue_brl_minor: '0',
  refunded_revenue_usd_minor: '0',
  chargeback_orders: 0,
  chargeback_revenue_brl_minor: '0',
  chargeback_revenue_usd_minor: '0',
  refund_chargeback_fee_count: 0,
  refund_chargeback_fee_brl_minor: '0',
  refund_chargeback_fee_usd_minor: '0',
  webhooks_received: 0,
  webhooks_quarantined: 0,
  utmify_deliveries_attempted: 0,
  utmify_deliveries_lost: 0,
  fee_settings: {
    vendepay_fee_pct: 0,
    extra_fee_minor: 0,
    extra_fee_currency: 'BRL',
    reserve_pct: 0,
    reserve_days: 90,
    payout_days: 0,
  },
  fee_vendepay_brl_minor: '0',
  fee_vendepay_usd_minor: '0',
  fee_extra_brl_minor: '0',
  fee_extra_usd_minor: '0',
  reserve_brl_minor: '0',
  reserve_usd_minor: '0',
  net_revenue_brl_minor: gross,
  net_revenue_usd_minor: '0',
  net_available_brl_minor: gross,
  net_available_usd_minor: '0',
});

const finance = (id: string, gross: string, paid: number): TrackingOverviewOffer => ({
  offer_id: id,
  offer_name: id,
  owner_id: 'tmx',
  paid_orders: paid,
  gross_revenue_brl_minor: gross,
  gross_revenue_usd_minor: '0',
  failed_orders: 0,
  failed_revenue_brl_minor: '0',
  failed_revenue_usd_minor: '0',
  refunded_orders: 0,
  refunded_revenue_brl_minor: '0',
  refunded_revenue_usd_minor: '0',
  chargeback_orders: 0,
  chargeback_revenue_brl_minor: '0',
  chargeback_revenue_usd_minor: '0',
  fees_brl_minor: '0',
  fees_usd_minor: '0',
  refund_chargeback_fee_count: 0,
  refund_chargeback_fee_brl_minor: '0',
  refund_chargeback_fee_usd_minor: '0',
  reserve_brl_minor: '0',
  reserve_usd_minor: '0',
  net_revenue_brl_minor: gross,
  net_revenue_usd_minor: '0',
  net_available_brl_minor: gross,
  net_available_usd_minor: '0',
});

test('missing PJR summaries cannot turn the complete TMX gross into a partial R$261,245.15', () => {
  const datasets = buildDatasets(
    'account',
    [offer('pjr-eng'), offer('pjr-esp'), offer('rest')],
    [],
    [undefined, undefined, summary('26124515', 1124)],
    [],
    [
      finance('pjr-eng', '45667789', 2900),
      finance('pjr-esp', '19747468', 1586),
      finance('rest', '26124515', 1124),
    ],
  );
  assert.equal(datasets[0]?.totals.revenue, 915397.72);
  assert.equal(datasets[0]?.totals.sales, 5610);
  assert.equal(datasets[0]?.conversionRate, null);
  assert.equal(datasets[0]?.totals.conversionRate, null);
});

test('financial source wins over a differing summary without adding either twice', () => {
  const [dataset] = buildDatasets(
    'offer',
    [offer('a')],
    [],
    [summary('99999', 99)],
    [],
    [finance('a', '12345', 3)],
  );
  assert.equal(dataset?.totals.revenue, 123.45);
  assert.equal(dataset?.totals.sales, 3);
  assert.equal(dataset?.totals.ic, 10);
  assert.equal(dataset?.pageViews, 100);
});

test('an incomplete group is unavailable instead of publishing partial revenue, sales or ARPU', () => {
  const datasets = buildDatasets(
    'account',
    [offer('a'), offer('b'), offer('other', 'other')],
    [],
    [summary('10000', 1), undefined, summary('30000', 3)],
    [],
    undefined,
  );
  assert.deepEqual(
    datasets.map((row) => row.key),
    ['other:BRL'],
  );
  assert.equal(datasets[0]?.totals.revenue, 300);
  assert.equal(
    hasCompleteOverviewScope([offer('a'), offer('b'), offer('other', 'other')], datasets),
    false,
  );
});

test('complete summaries remain a fallback when the financial endpoint is unavailable', () => {
  const [dataset] = buildDatasets(
    'account',
    [offer('a'), offer('b')],
    [],
    [summary('10001', 1), summary('20002', 2)],
    [],
    undefined,
  );
  assert.equal(dataset?.totals.revenue, 300.03);
  assert.equal(dataset?.totals.sales, 3);
  assert.equal(hasCompleteOverviewScope([offer('a'), offer('b')], [dataset!]), true);
});

test('zero is valid and matching offer IDs prevent cross-account or currency mixing', () => {
  const datasets = buildDatasets(
    'account',
    [offer('a'), offer('b', 'other'), offer('c', 'tmx', 'USD')],
    [],
    [],
    [],
    [
      finance('c', '34567', 3),
      finance('b', '12345', 2),
      finance('a', '0', 0),
      finance('not-in-scope', '999999999', 99),
    ],
  );
  assert.deepEqual(
    datasets.map((row) => [row.key, row.totals.revenue, row.totals.sales]),
    [
      ['tmx:BRL', 0, 0],
      ['other:BRL', 123.45, 2],
      ['tmx:USD', 345.67, 3],
    ],
  );
  assert.ok(datasets.every((row) => row.currency === 'BRL'));
});

test('invalid financial values cannot replace valid summary values or create a partial group', () => {
  const rows = [finance('a', 'NaN', 1), finance('b', '20000', Number.NaN)];
  const [fallback] = buildDatasets('account', [offer('a')], [], [summary('10000', 1)], [], rows);
  assert.equal(fallback?.totals.revenue, 100);
  assert.deepEqual(buildDatasets('account', [offer('a'), offer('b')], [], [], [], rows), []);
});

test('a blank financial amount means unavailable, not a confirmed zero sale', () => {
  assert.deepEqual(
    buildDatasets('offer', [offer('blank')], [], [], [], [finance('blank', '', 1)]),
    [],
  );
});

test('natural-view financial zero wins over an older general summary', () => {
  const [dataset] = buildDatasets(
    'offer',
    [offer('a')],
    [],
    [summary('10000', 2)],
    [],
    [finance('a', '0', 0)],
  );
  assert.equal(dataset?.totals.revenue, 0);
  assert.equal(dataset?.totals.sales, 0);
});
