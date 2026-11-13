import assert from 'node:assert/strict';
import test from 'node:test';
import type { RealCampaignSnapshot } from '../src/components/traffic/real-campaigns-model';
import {
  type TrafficAttribution,
  attributeTrafficRows,
  groupTrafficAttribution,
  summarizeCreativeAttribution,
} from '../src/components/traffic/traffic-attribution-model';
import { type ReportRow, reportMetrics } from '../src/components/traffic/traffic-reports-model';
const meta = {
  from: '2026-11-08',
  to: '2026-11-08',
  campaigns: [
    { id: '10', accountId: 'act_1' },
    { id: '20', accountId: 'act_1' },
  ],
  insights: [{ adId: '100', adsetId: '1000', campaignId: '10', accountId: 'act_1' }],
} as RealCampaignSnapshot;
const row: ReportRow = {
  id: '10',
  name: 'Campanha',
  subtitle: 'Meta',
  metrics: { ...reportMetrics([]), spend: 50, frontSales: 7, metaRoas: 0.8 },
};
const record = {
  offerId: 'offer',
  campaignId: '10',
  adsetId: '1000',
  adId: '100',
  accountId: '1',
  fronts: 1,
  upsells: 2,
  naturalUpsells: 1,
  clickedUpsells: 1,
  naturalGrossBrlMinor: '10000',
  clickedGrossBrlMinor: '5000',
  naturalGrossUsdMinor: '2000',
  clickedGrossUsdMinor: '1000',
  grossBrlMinor: '15000',
  netBrlMinor: '11800',
  grossUsdMinor: '3000',
  netUsdMinor: '2360',
  upsellGrossBrlMinor: '6000',
  upsellGrossUsdMinor: '1200',
};
const data: TrafficAttribution = {
  source: 'tmx-tracking',
  ownerId: 'owner',
  from: meta.from,
  to: meta.to,
  fetchedAt: '2026-11-09T00:00:00Z',
  rows: [record],
};
test('campaign gross revenue and ROAS add Meta front value and TMX upsells exactly once', () => {
  const source = { ...row, metrics: { ...row.metrics, metaPurchaseValue: 200 } };
  const result = attributeTrafficRows([source], meta, data, 'BRL').rows[0]!;
  assert.equal(result.metrics.upsells, 2);
  assert.equal(result.metrics.tmxGross, 260);
  assert.equal(result.metrics.tmxGrossRoas, 5.2);
  assert.equal(result.metrics.metaPurchaseValue, 200);
  assert.equal(attributeTrafficRows([source], meta, undefined, 'BRL').rows[0]!.metrics.tmxGross, null);
});
test('creative CPA, gross revenue, ARPU and gross ROAS use unique linked ads', () => {
  const snapshot = {
    ...meta,
    insights: [...meta.insights, { ...meta.insights[0]!, adId: '101' }],
  };
  const report = {
    ...data,
    rows: [
      record,
      {
        ...record,
        adId: '101',
        fronts: 0,
        upsells: 1,
        grossBrlMinor: '7000',
        netBrlMinor: null,
        upsellGrossBrlMinor: '7000',
      },
      { ...record, adId: null, grossBrlMinor: '999900' },
    ],
  };
  const { groups } = groupTrafficAttribution(snapshot, report, 'ads');
  const metrics = { spend: 50, metaPurchaseValue: 100 };
  const totals = summarizeCreativeAttribution(
    [{ adIds: ['100', '101', '100'] }],
    groups,
    'BRL',
    metrics,
  );
  assert.equal(totals.tmxFronts, 1);
  assert.equal(totals.upsells, 3);
  assert.equal(totals.tmxCpa, 50);
  assert.equal(totals.funnelArpu, 220);
  assert.equal(totals.tmxGross, 220);
  assert.equal(totals.tmxGrossRoas, 4.4);
  assert.equal(totals.tmxCreativeRoas, 4.6);
  const upsellOnly = summarizeCreativeAttribution([{ adIds: ['101'] }], groups, 'USD', {
    ...metrics,
    spend: 0,
  });
  assert.equal(upsellOnly.tmxGross, 30);
  assert.equal(upsellOnly.funnelArpu, null);
  assert.equal(upsellOnly.tmxCreativeRoas, null);
  const noMatch = summarizeCreativeAttribution([{ adIds: [] }], groups, 'BRL', metrics);
  assert.equal(noMatch.tmxGross, null);
  assert.equal(noMatch.tmxCreativeRoas, null);
  assert.equal(
    summarizeCreativeAttribution(
      [{ adIds: ['100'] }],
      new Map([['100', [{ ...record, upsellGrossBrlMinor: null }]]]),
      'BRL',
      metrics,
    ).tmxCreativeRoas,
    null,
  );
  const differentPeriod = groupTrafficAttribution(
    snapshot,
    { ...report, from: '2026-11-07' },
    'ads',
  );
  assert.equal(
    summarizeCreativeAttribution([{ adIds: ['100'] }], differentPeriod.groups, 'BRL', metrics)
      .tmxCpa,
    null,
  );
});
test('TMX adds upsells, ARPU per front and net ROAS without changing any Meta metric', () => {
  const result = attributeTrafficRows([row], meta, data, 'BRL').rows[0]!;
  assert.equal(result.metrics.upsells, 2);
  assert.equal(result.metrics.funnelArpu, 150);
  assert.equal(result.metrics.tmxAttributedRoas, 2.36);
  assert.equal(result.metrics.frontSales, 7);
  assert.equal(result.metrics.metaRoas, 0.8);
  assert.equal(row.metrics.upsells, null);
});
test('natural and registered-click ARPU share the same fronts denominator in both currencies', () => {
  for (const [currency, natural, clicked] of [
    ['BRL', 100, 50],
    ['USD', 20, 10],
  ] as const) {
    const r = attributeTrafficRows([row], meta, data, currency).rows[0]!.metrics;
    assert.equal(r.naturalArpu, natural);
    assert.equal(r.clickedArpu, clicked);
    assert.equal(r.naturalUpsells, 1);
    assert.equal(r.clickedUpsells, 1);
    assert.equal(r.naturalArpu! + r.clickedArpu!, r.funnelArpu);
  }
  const noFront = attributeTrafficRows(
    [row],
    meta,
    { ...data, rows: [{ ...record, fronts: 0 }] },
    'BRL',
  ).rows[0]!.metrics;
  assert.equal(noFront.naturalArpu, null);
  assert.equal(noFront.clickedArpu, null);
  const missing = attributeTrafficRows(
    [row],
    meta,
    { ...data, rows: [{ ...record, clickedGrossBrlMinor: null }] },
    'BRL',
  ).rows[0]!.metrics;
  assert.equal(missing.naturalArpu, 100);
  assert.equal(missing.clickedArpu, null);
});
test('IDs can resolve via an ad; conflicting IDs and names are never distributed by estimate', () => {
  const byAd = attributeTrafficRows(
    [row],
    meta,
    { ...data, rows: [{ ...record, campaignId: null }] },
    'BRL',
  );
  assert.equal(byAd.rows[0]!.metrics.upsells, 2);
  const conflict = attributeTrafficRows(
    [row],
    meta,
    { ...data, rows: [{ ...record, campaignId: '20' }] },
    'BRL',
  );
  assert.equal(conflict.rows[0]!.metrics.upsells, null);
  assert.equal(conflict.unmatchedUpsells, 2);
});
test('missing coverage, empty attribution and zero spend preserve unavailable values', () => {
  for (const source of [undefined, { ...data, from: '2026-11-07' }, { ...data, rows: [] }])
    assert.equal(
      attributeTrafficRows([row], meta, source, 'BRL').rows[0]!.metrics.tmxAttributedRoas,
      null,
    );
  const noFees = attributeTrafficRows(
    [row],
    meta,
    { ...data, rows: [{ ...record, netBrlMinor: null }] },
    'BRL',
  ).rows[0]!;
  assert.equal(noFees.metrics.funnelArpu, 150);
  assert.equal(noFees.metrics.tmxAttributedRoas, null);
  assert.equal(
    attributeTrafficRows([{ ...row, metrics: { ...row.metrics, spend: 0 } }], meta, data, 'BRL')
      .rows[0]!.metrics.tmxAttributedRoas,
    null,
  );
});
test('campaign-only tracking IDs populate fronts without inventing ad attribution', () => {
  const source = { ...data, rows: [{ ...record, adId: null, adsetId: null, accountId: null }] };
  const result = attributeTrafficRows([row], meta, source, 'BRL');
  assert.equal(result.rows[0]!.metrics.tmxFronts, 1);
  assert.equal(result.rows[0]!.metrics.upsells, 2);
  assert.equal(result.rows[0]!.metrics.frontSales, 7);
  assert.equal(
    attributeTrafficRows([row], meta, source, 'BRL', 'ads').rows[0]!.metrics.tmxFronts,
    null,
  );
  const historical = attributeTrafficRows(
    [row],
    meta,
    { ...source, rows: [{ ...source.rows[0]!, campaignId: 'old' }] },
    'BRL',
  );
  assert.equal(historical.unmatchedUpsells, 2);
  assert.equal(historical.rows[0]!.metrics.tmxFronts, null);
});
for (const from of ['2026-11-01', '2026-10-11'])
  test(`period ${from} recalculates new orders without retaining the previous totals`, () => {
    const period = { from, to: '2026-11-09' };
    const snapshot = { ...meta, ...period };
    const before = { ...data, ...period, rows: [{ ...record, adId: null, adsetId: null }] };
    const first = attributeTrafficRows([row], snapshot, before, 'BRL');
    const after = {
      ...before,
      fetchedAt: '2026-11-09T00:02:00Z',
      rows: [{ ...before.rows[0]!, fronts: 2, upsells: 5 }],
    };
    const refreshed = attributeTrafficRows([row], snapshot, after, 'BRL');
    assert.equal(first.rows[0]!.metrics.tmxFronts, 1);
    assert.equal(first.rows[0]!.metrics.upsells, 2);
    assert.equal(refreshed.rows[0]!.metrics.tmxFronts, 2);
    assert.equal(refreshed.rows[0]!.metrics.upsells, 5);
    assert.equal(refreshed.rows[0]!.metrics.frontSales, row.metrics.frontSales);
    assert.equal(
      attributeTrafficRows([row], snapshot, data, 'BRL').rows[0]!.metrics.tmxFronts,
      null,
    );
  });
