import assert from 'node:assert/strict';
import test from 'node:test';
import { overviewDetailOfferIds } from '../src/components/overview/overview-dashboard-build-datasets';
import { selectedOverviewDataset } from '../src/components/overview/overview-dashboard-support';
import type { TrackingOverviewOffer } from '../src/lib/api-client';

const offers = Array.from({ length: 19 }, (_, index) => ({
  id: `offer-${index}`,
  name: `Offer ${index}`,
  currency: 'BRL',
  ownerId: index < 12 ? 'owner' : 'other',
  ownerName: index < 12 ? 'Minha conta' : 'Outra conta',
}));
const finances = offers.map((offer) => ({
  offer_id: offer.id,
  gross_revenue_brl_minor: '100',
  paid_orders: 1,
})) as TrackingOverviewOffer[];

test('default scope reads twelve visible offers instead of all nineteen, without waiting for finances', () => {
  for (const data of [undefined, finances]) {
    const ids = overviewDetailOfferIds(offers, 'account', '', 'owner', data);
    assert.deepEqual(
      [...ids],
      offers.slice(0, 12).map((offer) => offer.id),
    );
  }
});

test('changing owner/currency reads the newly selected group; stale selection defaults to the current owner', () => {
  const ids = overviewDetailOfferIds(offers, 'account', 'other:BRL', 'owner', finances);
  assert.deepEqual(
    [...ids],
    offers.slice(12).map((offer) => offer.id),
  );
  assert.equal(
    overviewDetailOfferIds(offers, 'account', 'removed:BRL', 'owner', finances).size,
    12,
  );
  const split = offers.map((offer, index) => ({ ...offer, currency: index < 3 ? 'USD' : 'BRL' }));
  assert.equal(overviewDetailOfferIds(split, 'account', 'owner:USD', 'owner', finances).size, 3);
});

test('missing, invalid or incomplete financial rows retain their existing tracking-summary fallback', () => {
  for (const changed of [
    undefined,
    { ...finances[18], gross_revenue_brl_minor: '' },
    { ...finances[18], gross_revenue_brl_minor: '-1' },
    { ...finances[18], gross_revenue_brl_minor: '9007199254740992' },
    { ...finances[18], paid_orders: -1 },
  ]) {
    const data = [...finances.slice(0, 18), ...(changed ? [changed] : [])];
    const ids = overviewDetailOfferIds(offers, 'account', '', 'owner', data);
    assert.equal(ids.size, 13);
    assert.ok(ids.has(offers[18].id));
  }
  const zero = finances.map((row) => ({ ...row, paid_orders: 0, gross_revenue_brl_minor: '0' }));
  assert.equal(overviewDetailOfferIds(offers, 'account', '', 'owner', zero).size, 12);
});

test('legacy all-account rendering, unavailable finances and offer pages retain complete reads', () => {
  assert.equal(overviewDetailOfferIds(offers, 'account', '', 'owner', undefined, true).size, 19);
  assert.equal(overviewDetailOfferIds(offers, 'account', '', 'owner', []).size, 19);
  assert.deepEqual(
    [...overviewDetailOfferIds([offers[18]], 'offer', '', 'owner', finances)],
    [offers[18].id],
  );
});

test('query planning and the visible selector use the same selection priority', () => {
  const groups = [{ key: 'other:BRL' }, { key: 'owner:BRL' }];
  assert.equal(selectedOverviewDataset(groups, '', 'owner')?.key, 'owner:BRL');
  assert.equal(selectedOverviewDataset(groups, 'other:BRL', 'owner')?.key, 'other:BRL');
  assert.equal(selectedOverviewDataset(groups, '', undefined)?.key, 'other:BRL');
  assert.equal(selectedOverviewDataset([], '', 'owner'), undefined);
});
