import { expect, it, vi } from 'vitest';
vi.mock('../src/env.js', () => ({ env: { NODE_ENV: 'test', LOG_LEVEL: 'silent' } }));
import { aggregateTrafficAttribution, resolveTrafficNames } from '../src/services/traffic-attribution.js';
it('links exact unique names within the offer without overriding IDs or guessing ambiguous ads', () => {
  const row = { id: 'sale', offer_id: 'offer', provider: 'vendepay', source: { utm_campaign: 'Campaign', utm_content: 'Ad' } };
  const ad = { offer_id: 'offer', campaign_name: 'Campaign', ad_name: 'Ad', campaign_id: '10', ad_id: '100', adset_id: '20', account_id: 'act_30' };
  expect(resolveTrafficNames([row], [ad, ad])[0]?.source?.ad_id).toBe('100');
  expect(resolveTrafficNames([row], [ad, { ...ad, ad_id: '101' }])[0]).toEqual(row);
  expect(resolveTrafficNames([row], [{ ...ad, offer_id: 'other' }])[0]).toEqual(row);
  expect(resolveTrafficNames([row], [{ ...ad, ad_name: 'Ad edited' }])[0]).toEqual(row);
  const existing = { ...row, source: { ...row.source, ad_id: '999' } };
  expect(resolveTrafficNames([existing], [ad])[0]).toEqual(existing);
  const page = { ...row, page_source: { ad_id: '999' } };
  expect(resolveTrafficNames([page], [ad])[0]).toEqual(page);
  const conflict = { ...row, source: { ...row.source, campaign_id: '999' } };
  expect(resolveTrafficNames([conflict], [ad])[0]).toEqual(conflict);
});
const settings = {
  fee_pct: 10,
  fixed_fee_minor: 100,
  fee_currency: 'BRL',
  reserve_pct: 10,
  refund_fee_minor: 0,
  chargeback_fee_minor: 0,
};
const base = {
  id: 'front',
  offer_id: 'offer',
  source: { campaign_id: '10', ad_id: '100' },
  paid: true,
  refunded: false,
  chargeback: false,
  reversed: false,
  order_kind: 'front',
  provider: 'vendepay',
  connection_key: 'vendepay',
  amount: '10000',
  settings,
};
it('counts paid upsells once and calculates attributed net using configured fees and reserve', () => {
  const upsell = { ...base, id: 'upsell', order_kind: 'upsell_2', amount: '5000' };
  const rows = aggregateTrafficAttribution(
    [base, upsell, upsell],
    new Map([
      ['BRL', 1],
      ['USD', 5],
    ]),
  );
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    campaignId: '10',
    adId: '100',
    fronts: 1,
    upsells: 1,
    grossBrlMinor: '15000',
    netBrlMinor: '11800',
    grossUsdMinor: '3000',
    netUsdMinor: '2360',
    upsellGrossBrlMinor: '5000',
    upsellGrossUsdMinor: '1000',
  });
});
it('does not invent identifiers or net revenue when fee settings or FX are missing', () => {
  const result = aggregateTrafficAttribution(
    [{ ...base, source: { utm_campaign: 'Campanha pelo nome' }, settings: {} }],
    new Map([['BRL', 1]]),
  )[0]!;
  expect(result.campaignId).toBeNull();
  expect(result.grossBrlMinor).toBe('10000');
  expect(result.upsellGrossBrlMinor).toBe('0');
  expect(result.netBrlMinor).toBeNull();
  expect(result.grossUsdMinor).toBeNull();
});
it('a received reversal subtracts the old order without creating a new front or upsell', () => {
  const result = aggregateTrafficAttribution(
    [{ ...base, paid: false, refunded: true, reversed: true }],
    new Map([
      ['BRL', 1],
      ['USD', 5],
    ]),
  )[0]!;
  expect(result.fronts).toBe(0);
  expect(result.upsells).toBe(0);
  expect(result.grossBrlMinor).toBe('0');
  expect(result.netBrlMinor).toBe('-10000');
});
it('reuses the tracking normalizer for packed Meta UTMs and camelCase IDs without matching names', () => {
  const packed = aggregateTrafficAttribution(
    [
      {
        ...base,
        source: {
          utm_source: 'facebook',
          utm_campaign: 'Nome da campanha|120123456789012',
          utm_content: 'Criativo|120123456789013',
          utm_medium: 'Conjunto|120123456789014',
        },
      },
    ],
    new Map([['BRL', 1]]),
  )[0]!;
  expect(packed.campaignId).toBe('120123456789012');
  expect(packed.adId).toBe('120123456789013');
  expect(packed.adsetId).toBe('120123456789014');
});
it('reads the campaign ID from utm_id for fronts and inherited upsells, preserving explicit IDs', () => {
  const source = {
    utm_id: '120123456789012',
    utm_campaign: 'Campaign name',
    utm_content: 'Creative name',
  };
  const rows = aggregateTrafficAttribution(
    [
      { ...base, source },
      { ...base, id: 'upsell', order_kind: 'upsell_1', source },
    ],
    new Map([['BRL', 1]]),
  );
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ campaignId: source.utm_id, adId: null, fronts: 1, upsells: 1 });
  expect(
    aggregateTrafficAttribution(
      [{ ...base, source: { ...source, campaign_id: '999' } }],
      new Map([['BRL', 1]]),
    )[0]?.campaignId,
  ).toBe('999');
  expect(
    aggregateTrafficAttribution(
      [{ ...base, source: { utm_id: '{{campaign.id}}' } }],
      new Map([['BRL', 1]]),
    )[0]?.campaignId,
  ).toBeNull();
});
it('recovers historic PageView URL IDs for the front and its upsells without exposing the URL', () => {
  const source_url =
    'https://example.test/?utm_source=fb&utm_id=120123456789012&ad_id=120123456789013&email=private';
  const order = { ...base, source: { utm_campaign: 'Name' }, source_url };
  const result = aggregateTrafficAttribution(
    [order, { ...order, id: 'upsell', order_kind: 'upsell_1' }],
    new Map([['BRL', 1]]),
  )[0]!;
  expect(result).toMatchObject({
    campaignId: '120123456789012',
    adId: '120123456789013',
    fronts: 1,
    upsells: 1,
  });
  expect(JSON.stringify(result)).not.toContain('private');
  const conflict = aggregateTrafficAttribution(
    [{ ...order, source: { campaign_id: '999' } }],
    new Map([['BRL', 1]]),
  )[0]!;
  expect(conflict).toMatchObject({ campaignId: '999', adId: null });
  for (const value of [
    'invalid',
    'javascript:alert(1)',
    'https://example.test/?utm_id={{campaign.id}}',
  ])
    expect(
      aggregateTrafficAttribution([{ ...order, source_url: value }], new Map([['BRL', 1]]))[0]
        ?.campaignId,
    ).toBeNull();
});
it('partitions confirmed origins without counting unknowns, duplicate orders or old reversals as natural', () => {
  const natural = { ...base, is_natural: true, is_clicked: false };
  const clicked = {
    ...base,
    id: 'clicked',
    order_kind: 'upsell_2',
    amount: '3000',
    is_natural: false,
    is_clicked: true,
  };
  const rows = aggregateTrafficAttribution(
    [
      natural,
      { ...natural, id: 'natural-up', order_kind: 'upsell', amount: '2000' },
      clicked,
      clicked,
      { ...base, id: 'unknown', order_kind: 'upsell_3', amount: '4000' },
      { ...clicked, id: 'reversal', paid: false, refunded: true },
    ],
    new Map([
      ['BRL', 1],
      ['USD', 5],
    ]),
  );
  expect(rows[0]).toMatchObject({
    fronts: 1,
    upsells: 3,
    naturalUpsells: 1,
    clickedUpsells: 1,
    grossBrlMinor: '19000',
    naturalGrossBrlMinor: '12000',
    clickedGrossBrlMinor: '3000',
    naturalGrossUsdMinor: '2400',
    clickedGrossUsdMinor: '600',
  });
  const missing = aggregateTrafficAttribution(
    [{ ...natural, amount: null }, clicked],
    new Map([['BRL', 1]]),
  )[0]!;
  expect(missing.naturalGrossBrlMinor).toBeNull();
  expect(missing.clickedGrossBrlMinor).toBe('3000');
  expect(missing.clickedGrossUsdMinor).toBeNull();
  const conflict = aggregateTrafficAttribution(
    [{ ...clicked, is_natural: true }],
    new Map([['BRL', 1]]),
  )[0]!;
  expect(conflict.naturalUpsells).toBe(0);
  expect(conflict.clickedUpsells).toBe(0);
});
it('keeps paid-order IDs ahead of conflicting PageView fields and only fills compatible origins', () => {
  for (const source of [{ utm_id: '111' }, { campaign_id: '111' }]) {
    const r = aggregateTrafficAttribution(
      [{ ...base, source, page_source: { campaign_id: '222', ad_id: '223' } }],
      new Map([['BRL', 1]]),
    )[0]!;
    expect(r).toMatchObject({ campaignId: '111', adId: null });
  }
  const matching = aggregateTrafficAttribution(
    [{ ...base, source: { utm_id: '111' }, page_source: { campaign_id: '111', ad_id: '112' } }],
    new Map([['BRL', 1]]),
  )[0]!;
  expect(matching).toMatchObject({ campaignId: '111', adId: '112' });
  const disjoint = aggregateTrafficAttribution(
    [{ ...base, source: { ad_id: '100' }, page_source: { campaign_id: '222' } }],
    new Map([['BRL', 1]]),
  )[0]!;
  expect(disjoint).toMatchObject({ campaignId: null, adId: '100' });
});
