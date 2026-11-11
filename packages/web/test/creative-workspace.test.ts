import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { NAV_ITEMS } from '../src/components/hub/nav-config';
import { resolveNavigation, visibleNavigation } from '../src/components/hub/navigation';
import {
  consolidateCreatives,
  creativeAdsFromMeta,
  creativeBatch,
  creativeDeliveryAssessment,
  creativeDriveSchema,
  creativeMetrics,
  demoCreativeAds,
  driveUrl,
  matchDriveCreative,
} from '../src/components/traffic/creative-workspace-model';
import type { RealCampaignSnapshot } from '../src/components/traffic/real-campaigns-model';
import { availableTrafficTabs } from '../src/components/traffic/traffic-model';
import type { AuthUser } from '../src/lib/api-client/auth-types';

const range = { from: '2026-11-10', to: '2026-11-10' };
const sample = demoCreativeAds(range, 'BRL');
const ad = sample[0]!;
const fileUrl = 'https://drive.google.com/file/d/synthetic_file_123456789/view';
test('Drive matching removes only a final mp4 extension and respects exact name and offer', () => {
  const folders = {
    SLMD: { folderUrl: '', files: [{ name: `${ad.name}.mp4`, url: fileUrl, batch: 'Leva 19' }] },
  };
  assert.equal(matchDriveCreative(ad, folders).status, 'linked');
  assert.equal(matchDriveCreative({ ...ad, offer: 'PJR_ESP' }, folders).status, 'unmatched');
  for (const name of [
    ad.name.toLowerCase(),
    `${ad.name} `,
    `${ad.name}-copia`,
    `${ad.name}.mp4.bak`,
  ])
    assert.equal(matchDriveCreative({ ...ad, name }, folders).status, 'unmatched');
  assert.equal(
    matchDriveCreative(ad, {
      SLMD: { folderUrl: '', files: [{ name: `${ad.name}.MP4`, url: '', batch: 'Leva 19' }] },
    }).status,
    'missing_link',
  );
});
test('duplicate filenames are ambiguous rather than silently selecting the first Drive file', () => {
  const file = { name: `${ad.name}.mp4`, url: fileUrl, batch: 'Leva 19' };
  const match = matchDriveCreative(ad, {
    SLMD: {
      folderUrl: '',
      files: [file, { ...file, url: fileUrl.replace('123456789', '987654321') }],
    },
  });
  assert.equal(match.status, 'ambiguous');
  assert.equal(match.file, null);
});
test('Drive links reject other hosts, credentials, unsafe protocols and wrong resource types', () => {
  assert.equal(driveUrl(`${fileUrl}?usp=sharing`, 'file'), fileUrl);
  assert.equal(
    driveUrl(`${fileUrl}?resourcekey=valid_resource_key`, 'file'),
    `${fileUrl}?resourcekey=valid_resource_key`,
  );
  for (const url of [
    'javascript:alert(1)',
    fileUrl.replace('https:', 'http:'),
    fileUrl.replace('drive.google.com', 'drive.google.com.evil.test'),
    fileUrl.replace('drive.google.com', 'user@drive.google.com'),
    fileUrl.replace('drive.google.com', 'drive.google.com:444'),
    'https://drive.google.com/drive/folders/synthetic_folder_12345',
  ])
    assert.equal(driveUrl(url, 'file'), null);
  assert.ok(
    !creativeDriveSchema.safeParse({
      SLMD: {
        folderUrl: '',
        files: [{ name: 'a.mp4', url: 'https://evil.test/file', batch: 'Leva 1' }],
      },
    }).success,
  );
});
test('leva parsing handles common separators without confusing ad numbers', () => {
  assert.equal(creativeBatch('AD03-L19_creative.mp4'), 'Leva 19');
  assert.equal(creativeBatch('SLMD_Leva_20_AD05'), 'Leva 20');
  assert.equal(creativeBatch('AD19'), 'Sem leva');
  assert.equal(creativeBatch('AD 06', '[L019] Teste'), 'Leva 19');
  assert.equal(creativeBatch('L19_AD01', 'L20'), 'Sem leva');
});
test('creative consolidation joins multiple ad IDs, keeps offers separate and recomputes ratios', () => {
  const repeated = sample.filter((row) => row.name === ad.name && row.offer === ad.offer);
  assert.equal(repeated.length, 2);
  const combined = consolidateCreatives([
    ...repeated,
    { ...ad, id: 'other-offer', offer: 'OTHER' },
  ]);
  assert.equal(combined.length, 2);
  assert.equal(combined[0]!.adIds.length, 2);
  assert.equal(
    consolidateCreatives([ad, { ...ad, batch: 'Leva 20', id: 'different-batch' }]).length,
    2,
  );
  const m = creativeMetrics(repeated);
  assert.equal(
    m.spend,
    repeated.reduce((sum, a) => sum + a.amounts.spend!, 0),
  );
  assert.equal(m.cpa, m.spend! / m.frontSales!);
  assert.equal(m.ctr, m.clicks! / m.impressions!);
  assert.equal(m.metaRoas, m.metaPurchaseValue! / m.spend!);
});
test('unknown metrics stay unknown in consolidated rows; zero denominators are not invented zeros', () => {
  const unknown = {
    ...ad,
    amounts: { ...ad.amounts, spend: null, frontSales: null, videoViews: null },
  };
  const m = creativeMetrics([ad, unknown]);
  assert.equal(m.spend, null);
  assert.equal(m.cpa, null);
  assert.equal(m.hookRate, null);
  assert.equal(creativeMetrics([]).metaRoas, null);
});
test('demonstration responds to date range and currency without changing CTR or ROAS', () => {
  const long = demoCreativeAds({ from: '2026-11-01', to: '2026-11-10' }, 'BRL');
  assert.equal(long[0]!.amounts.spend, ad.amounts.spend! * 10);
  const usd = demoCreativeAds(range, 'USD');
  assert.equal(usd[0]!.amounts.spend, ad.amounts.spend! / 5);
  assert.equal(creativeMetrics(usd).metaRoas, creativeMetrics(sample).metaRoas);
});
function sampleMetaSnapshot(): RealCampaignSnapshot {
  return {
    fetchedAt: '2026-11-10T13:00:00Z',
    from: range.from,
    to: range.to,
    purchaseClassification: 'front_only_user_confirmed',
    failures: [],
    accounts: [
      {
        id: 'a',
        name: 'Account',
        businessId: null,
        businessName: null,
        currency: 'BRL',
        timezone: 'America/Sao_Paulo',
      },
    ],
    campaigns: [
      {
        id: 'c',
        name: 'SLM_DE | Teste',
        accountId: 'a',
        status: 'ACTIVE',
        effectiveStatus: 'ACTIVE',
        objective: 'OUTCOME_SALES',
        createdAt: null,
        updatedAt: null,
      },
    ],
    insights: [
      {
        campaignId: 'c',
        accountId: 'a',
        date: range.from,
        currency: 'BRL',
        adsetId: 's',
        adId: 'real-ad',
        adName: 'SLMD_L19_AD01',
        video: true,
        spend: '100',
        impressions: '1000',
        linkClicks: '50',
        actions: [
          { action_type: 'purchase', value: '2' },
          { action_type: 'initiate_checkout', value: '5' },
        ],
        actionValues: [{ action_type: 'purchase', value: '300' }],
      },
    ],
  };
}
test('Meta adapter uses actual ad IDs and classifications, without a UTMify dependency', () => {
  const snapshot = sampleMetaSnapshot();
  const rows = creativeAdsFromMeta(snapshot, range, 'BRL', {});
  assert.equal(rows[0]!.id, 'real-ad');
  assert.equal(rows[0]!.offer, 'SLM_DE');
  assert.equal(rows[0]!.name, 'SLMD_L19_AD01');
  assert.equal(creativeMetrics(rows).metaRoas, 3);
  const unknown = creativeAdsFromMeta(
    { ...snapshot, purchaseClassification: undefined },
    range,
    'BRL',
    {},
  );
  assert.equal(unknown[0]!.amounts.frontSales, null);
});

test('automatic status uses closed inactive days, consecutive delivery and Meta ROAS in BRL', () => {
  const snapshot = sampleMetaSnapshot();
  const base = snapshot.insights[0]!;
  const dates = { from: '2026-08-01', to: '2026-11-10' };
  snapshot.from = dates.from;
  snapshot.fx = {
    base: 'USD',
    fetchedAt: snapshot.fetchedAt,
    provider: 'test',
    rates: { '2026-11-01': { BRL: 5 }, '2026-11-10': { BRL: 5 } },
  };
  snapshot.campaigns.push({ ...snapshot.campaigns[0]!, id: 'paused', effectiveStatus: 'PAUSED' });
  const insight = (ad: number, day: string, spend: number, value = 0, currency = 'BRL') => ({
    ...base,
    adId: `ad-${ad}`,
    adName: `SLM_DE_AD${ad}_L19`,
    date: `2026-11-${day}`,
    currency,
    spend: String(spend),
    actions: value ? [{ action_type: 'purchase', value: '1' }] : [],
    actionValues: value ? [{ action_type: 'purchase', value: String(value) }] : [],
  });
  snapshot.insights = [
    { ...insight(1, '10', 999), campaignId: 'paused' },
    insight(2, '10', 100),
    insight(3, '05', 1000),
    insight(4, '06', 1000),
    ...['05', '06', '07', '08', '09', '10'].map((day) => insight(5, day, 200)),
    ...['04', '06', '07', '08', '09', '10'].map((day) => insight(6, day, 200)),
    insight(7, '05', 300, 421, 'USD'),
    insight(8, '10', 1500, 2100),
    insight(9, '10', 1499, 2500),
    insight(10, '10', 0),
    { ...insight(11, '10', 0), campaignId: 'paused' },
    { ...insight(12, '05', 1000), campaignId: 'paused' },
    ...['05', '06', '07', '08', '09', '10'].map((day) => insight(13, day, 100)),
    ...['05', '06', '07', '08', '09', '10'].map((day) => insight(14, day, 1000, 770)),
    { ...insight(15, '10', 6000, 4620), campaignId: 'paused' },
    insight(16, '10', 1499, 800),
  ];
  const state = { catalog: null, metadata: {} };
  const { statuses, lowRoas } = creativeDeliveryAssessment(snapshot, dates, state, {});
  assert.deepEqual(
    Array.from({ length: 13 }, (_, i) => statuses.get(`SLM_DE:AD${i + 1}:L19`)),
    [
      'Stand by', 'Testando', 'Não validado', 'Testando', 'Validado', 'Testando', 'Validado',
      'Testando', 'Testando', 'Testando', 'Stand by', 'Não validado', 'Testando',
    ],
  );
  assert.deepEqual(lowRoas, ['SLM_DE:AD14:L19']);
  assert.equal(statuses.get('SLM_DE:AD14:L19'), 'Não validado');
  assert.equal(statuses.get('SLM_DE:AD15:L19'), 'Não validado');
  assert.equal(
    creativeDeliveryAssessment({ ...snapshot, fetchedAt: '2026-11-09T13:00:00Z' }, dates, state, {}).statuses.size,
    0,
  );
  snapshot.failures = [{ accountId: 'a', stage: 'insights', code: null }];
  assert.deepEqual(creativeDeliveryAssessment(snapshot, dates, state, {}), {
    statuses: new Map(),
    lowRoas: [],
  });
});

test('new workspace is available only in local preview; existing production navigation is retained', () => {
  assert.ok(!availableTrafficTabs(false).some(([id]) => id === 'ads-intelligence'));
  assert.ok(availableTrafficTabs(true).some(([id]) => id === 'ads-intelligence'));
  const admin = {
    id: 'synthetic',
    role: 'admin',
    name: 'QA',
    email: 'qa@example.test',
    createdAt: '',
  } as AuthUser;
  const production = visibleNavigation(admin, NAV_ITEMS, { syntheticPreview: false });
  const local = visibleNavigation(admin, NAV_ITEMS, { syntheticPreview: true });
  assert.equal(
    resolveNavigation('/trafego', 'view=ads-intelligence', local)?.item.id,
    'traffic-ads-intelligence',
  );
  assert.equal(resolveNavigation('/ads-intelligence', '', production)?.item.id, 'ads-intelligence');
  assert.ok(
    !production.flatMap((i) => i.children ?? []).some((i) => i.id === 'traffic-ads-intelligence'),
  );
  const page = readFileSync(
    new URL('../src/components/traffic/creative-workspace.tsx', import.meta.url),
    'utf8',
  );
  assert.ok(!page.includes('DateRangeFilter'));
  assert.ok(!page.includes('demoCreativeAds'));
  assert.ok(!page.includes('Por anúncio'));
  assert.ok(!page.includes('utmify'));
});
