import assert from 'node:assert/strict';
import test from 'node:test';
import {
  type RealCampaignSnapshot,
  assignedOffer,
  campaignOffer,
  conversionRate,
  metaPurchase,
  nativeTrafficFinance,
  realCampaignRows,
  tmxGeneralRoas,
  trafficTotals,
} from '../src/components/traffic/real-campaigns-model';
const range = { from: '2026-11-01', to: '2026-11-08' };
test('ROAS TMX usa resultado final líquido como múltiplo e não ROI percentual', () => {
  assert.equal(tmxGeneralRoas(250, 100), 2.5);
  assert.equal(tmxGeneralRoas(0, 100), 0);
  assert.equal(tmxGeneralRoas(-20, 100), -0.2);
  assert.equal(tmxGeneralRoas(null, 100), null);
  assert.equal(tmxGeneralRoas(100, 0), null);
  assert.equal(tmxGeneralRoas(100, 50, true), null);
});
const filters = {
  currency: 'BRL',
  account: 'act_1',
  business: '',
  status: '',
  query: '',
  deliveryOnly: true,
};
const snapshot: RealCampaignSnapshot = {
  fetchedAt: '2026-11-08T12:00:00Z',
  from: '2026-10-01',
  to: '2026-11-08',
  failures: [],
  accounts: [
    {
      id: 'act_1',
      name: 'Conta BR',
      businessId: '1',
      businessName: 'BM',
      currency: 'BRL',
      timezone: 'America/Sao_Paulo',
    },
    {
      id: 'act_2',
      name: 'Conta US',
      businessId: '2',
      businessName: 'BM US',
      currency: 'USD',
      timezone: 'America/New_York',
    },
  ],
  campaigns: [
    {
      id: '10',
      name: 'Campanha real',
      accountId: 'act_1',
      status: 'ACTIVE',
      effectiveStatus: 'ACTIVE',
      objective: 'OUTCOME_SALES',
      createdAt: null,
      updatedAt: null,
    },
    {
      id: '20',
      name: 'Campanha US',
      accountId: 'act_2',
      status: 'PAUSED',
      effectiveStatus: 'PAUSED',
      objective: 'OUTCOME_SALES',
      createdAt: null,
      updatedAt: null,
    },
  ],
  insights: [
    {
      campaignId: '10',
      accountId: 'act_1',
      date: '2026-11-01',
      currency: 'BRL',
      spend: '0.10',
      impressions: '100',
      linkClicks: '10',
      actions: [
        { action_type: 'initiate_checkout', value: '3' },
        { action_type: 'offsite_conversion.fb_pixel_initiate_checkout', value: '2' },
      ],
    },
    {
      campaignId: '10',
      accountId: 'act_1',
      date: '2026-11-02',
      currency: 'BRL',
      spend: '0.20',
      impressions: '200',
      linkClicks: '20',
      actions: [],
    },
    {
      campaignId: '20',
      accountId: 'act_2',
      date: '2026-11-01',
      currency: 'USD',
      spend: '100.00',
      impressions: '500',
      linkClicks: '50',
      actions: [],
    },
  ],
};

test('campanhas reais agregam centavos, filtram moeda e não fabricam front ou ROI', () => {
  const rows = realCampaignRows(snapshot, range, filters);
  assert.equal(rows.length, 1);
  const metrics = rows[0]!.metrics;
  assert.equal(metrics.spend, 0.3);
  assert.equal(metrics.impressions, 300);
  assert.equal(metrics.checkouts, 2);
  assert.equal(metrics.cpm, 1);
  assert.equal(metrics.cpc, 0.01);
  for (const key of ['frontSales', 'cpa', 'finalResult', 'roi', 'hookRate', 'roas'] as const)
    assert.equal(metrics[key], null);
  assert.equal(
    realCampaignRows(snapshot, range, { ...filters, currency: 'USD', account: 'act_2' })[0]!.metrics
      .spend,
    100,
  );
});
test('Connect Rate uses summed Meta landing views and link clicks, preserving missing data', () => {
  const make = (clicks: (string | null)[], views: number[]) =>
    realCampaignRows(
      {
        ...snapshot,
        insights: snapshot.insights
          .filter((r) => r.accountId === 'act_1')
          .map((r, i) => ({
            ...r,
            linkClicks: clicks[i]!,
            actions: [{ action_type: 'landing_page_view', value: String(views[i]) }],
          })),
      },
      range,
      filters,
    );
  const rows = make(['10', '90'], [8, 45]);
  assert.equal(rows[0]!.metrics.connectRate, 0.53);
  assert.equal(trafficTotals(rows).connectRate, 0.53);
  assert.equal(make(['0', '0'], [0, 0])[0]!.metrics.connectRate, null);
  assert.equal(make(['10', null], [8, 45])[0]!.metrics.connectRate, null);
  assert.equal(trafficTotals(make(['10', null], [8, 45])).connectRate, null);
  assert.equal(make(['10', '90'], [0, 0])[0]!.metrics.connectRate, 0);
  const a = {
    ...rows[0]!,
    id: 'a',
    metrics: { ...rows[0]!.metrics, metaLandingViews: 8, clicks: 10, connectRate: 0.8 },
  };
  const b = {
    ...rows[0]!,
    id: 'b',
    metrics: { ...rows[0]!.metrics, metaLandingViews: 45, clicks: 90, connectRate: 0.5 },
  };
  assert.equal(trafficTotals([a, b]).connectRate, 0.53);
  assert.equal(trafficTotals([{ ...a, unavailable: true }, b]).connectRate, null);
});
test('Connect Rate follows monthly and rolling periods at ad level and in hourly comparisons', () => {
  const insights = [
    {
      ...snapshot.insights[0]!,
      date: '2026-10-20',
      adId: '100',
      linkClicks: '10',
      actions: [{ action_type: 'landing_page_view', value: '8' }],
    },
    {
      ...snapshot.insights[0]!,
      date: '2026-11-05',
      adId: '200',
      linkClicks: '90',
      actions: [{ action_type: 'landing_page_view', value: '45' }],
    },
  ];
  const m = {
    ...snapshot,
    from: '2026-10-11',
    to: '2026-11-09',
    insights,
    hourly: insights.map((r, i) => ({ ...r, hour: i === 0 ? 8 : 10 })),
  };
  for (const [from, expected] of [
    ['2026-11-01', 0.5],
    ['2026-10-11', 0.53],
  ] as const) {
    const period = { from, to: m.to };
    const campaigns = realCampaignRows(m, period, filters);
    const ads = realCampaignRows(m, period, { ...filters, level: 'ads' });
    assert.equal(trafficTotals(campaigns).connectRate, expected);
    assert.equal(trafficTotals(ads).connectRate, expected);
    for (const window of [4, 5]) {
      const hourly = { ...m, insights: m.hourly.filter((r) => Math.floor(r.hour / 2) === window) };
      const general = realCampaignRows(hourly, period, {
        ...filters,
        includeAttributedZeroSpend: true,
      });
      const byAd = realCampaignRows(hourly, period, {
        ...filters,
        level: 'ads',
        includeAttributedZeroSpend: true,
      });
      const expectedWindow = window === 5 ? 0.5 : from === '2026-10-11' ? 0.8 : null;
      assert.equal(trafficTotals(general).connectRate, expectedWindow);
      assert.equal(trafficTotals(byAd).connectRate, expectedWindow);
    }
  }
});
test('datas, entrega, BM, conta e status funcionam sobre os dados reais', () => {
  assert.equal(
    realCampaignRows(snapshot, { from: '2026-11-02', to: '2026-11-02' }, filters)[0]!.metrics.spend,
    0.2,
  );
  assert.equal(
    realCampaignRows(snapshot, { from: '2026-11-08', to: '2026-11-08' }, filters).length,
    0,
  );
  assert.equal(
    realCampaignRows(
      snapshot,
      { from: '2026-11-08', to: '2026-11-08' },
      { ...filters, deliveryOnly: false },
    ).length,
    0,
  );
  assert.equal(realCampaignRows(snapshot, range, { ...filters, business: '2' }).length, 0);
  assert.equal(realCampaignRows(snapshot, range, { ...filters, account: 'missing' }).length, 0);
  assert.equal(realCampaignRows(snapshot, range, { ...filters, status: 'PAUSED' }).length, 0);
  assert.equal(realCampaignRows(snapshot, range, { ...filters, query: 'Conta BR' }).length, 1);
});
test('duplicatas não somam duas vezes e falta de cobertura é explícita', () => {
  const missingImpressions = realCampaignRows(
    { ...snapshot, insights: snapshot.insights.map((row) => ({ ...row, impressions: null })) },
    range,
    filters,
  )[0]!;
  assert.ok(missingImpressions.missingMetrics?.includes('impressions'));
  assert.equal(missingImpressions.metrics.cpm, null);
  assert.equal(missingImpressions.metrics.spend, 0.3);
  assert.equal(
    realCampaignRows(
      { ...snapshot, insights: [...snapshot.insights, snapshot.insights[0]!] },
      range,
      filters,
    )[0]!.metrics.spend,
    0.3,
  );
  assert.equal(
    realCampaignRows(
      { ...snapshot, failures: [{ accountId: 'act_1', stage: 'insights', code: 200 }] },
      range,
      filters,
    )[0]!.unavailable,
    true,
  );
  assert.equal(
    realCampaignRows(snapshot, { from: '2026-09-01', to: '2026-11-08' }, filters)[0]!.unavailable,
    true,
  );
});

test('Purchase vira front somente após confirmação e aliases nunca são somados', () => {
  const data: RealCampaignSnapshot = {
    ...snapshot,
    purchaseClassification: 'front_only_user_confirmed',
    insights: snapshot.insights.map((row, index) => ({
      ...row,
      actions:
        index === 0
          ? [
              ...row.actions,
              { action_type: 'offsite_conversion.fb_pixel_purchase', value: '2' },
              { action_type: 'purchase', value: '2' },
              { action_type: 'omni_purchase', value: '2' },
            ]
          : row.actions,
      actionValues:
        index === 0
          ? [
              { action_type: 'offsite_conversion.fb_pixel_purchase', value: '30.00' },
              { action_type: 'purchase', value: '30.00' },
              { action_type: 'omni_purchase', value: '30.00' },
            ]
          : [],
    })),
  };
  const metrics = realCampaignRows(data, range, filters)[0]!.metrics;
  assert.equal(metrics.frontSales, 2);
  assert.equal(metrics.cpa, 0.15);
  assert.equal(metrics.metaPurchaseValue, 30);
  assert.equal(metrics.metaRoas, 100);
  assert.equal(metrics.metaGrossRoi, 99);
  assert.equal(metrics.roi, null);
  assert.equal(metrics.finalResult, null);
  assert.equal(metrics.checkoutConversion, 1);
  assert.equal(
    realCampaignRows({ ...data, purchaseClassification: undefined }, range, filters)[0]!.metrics
      .frontSales,
    null,
  );
});

test('valor ausente não produz ROI fictício e zero compras mantém CPA indefinido', () => {
  const noValue: RealCampaignSnapshot = {
    ...snapshot,
    purchaseClassification: 'front_only_user_confirmed',
    insights: snapshot.insights.map((row) => ({
      ...row,
      actions: [{ action_type: 'offsite_conversion.fb_pixel_purchase', value: '2' }],
      actionValues: [],
    })),
  };
  const m = realCampaignRows(noValue, range, filters)[0]!.metrics;
  assert.equal(m.frontSales, 4);
  assert.equal(m.metaPurchaseValue, null);
  assert.equal(m.metaGrossRoi, null);
  const zero = realCampaignRows(
    {
      ...snapshot,
      purchaseClassification: 'front_only_user_confirmed',
      insights: snapshot.insights.map((row) => ({ ...row, actionValues: [] })),
    },
    range,
    filters,
  )[0]!.metrics;
  assert.equal(zero.frontSales, 0);
  assert.equal(zero.cpa, null);
  assert.equal(zero.metaGrossRoi, -1);
  const unavailable = realCampaignRows(
    { ...noValue, failures: [{ accountId: 'act_1', stage: 'insights', code: 200 }] },
    range,
    filters,
  )[0]!;
  assert.equal(unavailable.unavailable, true);
  assert.equal(unavailable.metrics.frontSales, null);
});

test('fallback usa uma única família de Purchase e o valor do mesmo tipo', () => {
  const row = {
    ...snapshot.insights[0]!,
    actions: [{ action_type: 'omni_purchase', value: '3' }],
    actionValues: [{ action_type: 'omni_purchase', value: '49.90' }],
  };
  assert.deepEqual(metaPurchase(row), { count: 3, value: 49.9 });
  assert.equal(
    metaPurchase({ ...row, actionValues: [{ action_type: 'purchase', value: '999' }] }).value,
    null,
  );
  assert.deepEqual(
    metaPurchase({
      ...row,
      actions: [
        ...row.actions,
        { action_type: 'offsite_conversion.fb_pixel_purchase', value: '0' },
      ],
      actionValues: [{ action_type: 'offsite_conversion.fb_pixel_purchase', value: '0' }],
    }),
    { count: 0, value: 0 },
  );
});

test('todas as moedas permanecem incluídas e usam câmbio diário anterior, nunca futuro', () => {
  const converted: RealCampaignSnapshot = {
    ...snapshot,
    fx: {
      base: 'USD',
      provider: 'test',
      fetchedAt: snapshot.fetchedAt,
      rates: { '2026-10-30': { BRL: 5, EUR: 0.9, ZAR: 17 }, '2026-11-03': { BRL: 6 } },
    },
  };
  const rows = realCampaignRows(converted, range, { ...filters, account: '', currency: 'BRL' });
  assert.equal(rows.length, 2);
  assert.equal(rows.find((row) => row.id === '20')!.metrics.spend, 500);
  assert.equal(conversionRate(converted, 'USD', 'BRL', '2026-11-01'), 5);
  assert.equal(conversionRate(converted, 'EUR', 'BRL', '2026-11-01'), 5 / 0.9);
  assert.equal(conversionRate(converted, 'USD', 'BRL', '2026-11-11'), null);
  const usd = realCampaignRows(converted, range, { ...filters, account: '', currency: 'USD' });
  assert.equal(usd.length, 2);
  assert.equal(usd.find((row) => row.id === '10')!.metrics.spend, 0.06);
});

test('oferta usa código inequívoco, aceita classificação manual e não confunde código genérico', () => {
  assert.equal(campaignOffer('[PJR_ENG] [TESTE]'), 'PJR_ENG');
  assert.equal(campaignOffer('[CBO] [PJR_ESP_AD01]'), 'PJR_ESP');
  assert.equal(campaignOffer('CPJRS - escala'), 'CPJRS');
  assert.equal(campaignOffer('PJRN teste'), 'PJRN');
  assert.equal(campaignOffer('[CBO] [Ad-5_mod]'), '');
  assert.equal(campaignOffer('[PJR_ENG] [SLM_DE]'), '');
  assert.equal(assignedOffer({ id: '1', name: '[PJR_ENG]' }, { '1': '' }), '');
  const classified = realCampaignRows(snapshot, range, {
    ...filters,
    offer: 'PJR_ENG',
    mappings: { '10': 'PJR_ENG' },
  });
  assert.equal(classified.length, 1);
  assert.equal(
    realCampaignRows(snapshot, range, { ...filters, offer: '__unclassified' }).length,
    1,
  );
});

test('TMX usa net_available da API original e nunca mistura outros proprietários', () => {
  const own = {
    offer_id: 'offer',
    offer_name: 'PJR_ENG',
    owner_id: 'user',
    net_available_brl_minor: '700',
    gross_revenue_brl_minor: '1000',
    net_available_usd_minor: '140',
    gross_revenue_usd_minor: '200',
    fees_missing_operations: 0,
  };
  const rows = [
    own,
    { ...own, offer_id: 'other', owner_id: 'other-user', net_available_brl_minor: '999999' },
  ] as import('@/lib/api-client').TrackingOverviewOffer[];
  assert.deepEqual(nativeTrafficFinance(rows, 'user', '', {}, 'BRL'), { final: 7, gross: 10 });
  assert.equal(nativeTrafficFinance([own], 'company-member', '', {}, 'BRL'), null);
  assert.deepEqual(nativeTrafficFinance([own], 'company-member', '', {}, 'BRL', true), {
    final: 7,
    gross: 10,
  });
  assert.deepEqual(nativeTrafficFinance(rows, 'user', 'PJR_ENG', {}, 'USD'), {
    final: 1.4,
    gross: 2,
  });
  assert.equal(nativeTrafficFinance(rows, 'user', 'UNKNOWN', {}, 'BRL'), null);
  assert.deepEqual(nativeTrafficFinance(rows, 'user', 'CUSTOM', { CUSTOM: 'offer' }, 'BRL'), {
    final: 7,
    gross: 10,
  });
  assert.equal(
    nativeTrafficFinance(
      [{ ...own, fees_missing_operations: 1 }] as typeof rows,
      'user',
      '',
      {},
      'BRL',
    ),
    null,
  );
});

test('linhas de anúncios e horas não são deduplicadas como uma única campanha/dia', () => {
  const granular: RealCampaignSnapshot = {
    ...snapshot,
    insights: [
      { ...snapshot.insights[0]!, adId: '111', adName: 'Ad1', adsetId: '11', hour: 1 },
      { ...snapshot.insights[0]!, adId: '111', adName: 'Ad1', adsetId: '11', hour: 2 },
      { ...snapshot.insights[0]!, adId: '112', adName: 'Ad2', adsetId: '11', hour: 2 },
    ],
  };
  assert.equal(realCampaignRows(granular, range, filters)[0]!.metrics.spend, 0.3);
  assert.equal(realCampaignRows(granular, range, { ...filters, level: 'ads' }).length, 2);
});

test('hook e conversão LPV usam bases somadas, não médias de percentuais', () => {
  const source: RealCampaignSnapshot = {
    ...snapshot,
    purchaseClassification: 'front_only_user_confirmed',
    insights: [
      {
        ...snapshot.insights[0]!,
        adId: '1',
        video: true,
        impressions: '100',
        actions: [
          { action_type: 'video_view', value: '30' },
          { action_type: 'landing_page_view', value: '10' },
          { action_type: 'purchase', value: '2' },
        ],
        actionValues: [{ action_type: 'purchase', value: '20' }],
      },
      {
        ...snapshot.insights[1]!,
        adId: '2',
        video: true,
        impressions: '200',
        actions: [
          { action_type: 'video_view', value: '90' },
          { action_type: 'landing_page_view', value: '30' },
          { action_type: 'purchase', value: '2' },
        ],
        actionValues: [{ action_type: 'purchase', value: '20' }],
      },
    ],
  };
  const rows = realCampaignRows(source, range, { ...filters, level: 'ads' });
  const totals = trafficTotals(rows);
  assert.equal(totals.hookRate, 0.4);
  assert.equal(totals.metaLandingViews, 40);
  assert.equal(totals.metaLandingConversion, 0.1);
  const unknown = realCampaignRows(
    { ...source, insights: source.insights.map((row) => ({ ...row, video: null })) },
    range,
    filters,
  )[0]!.metrics;
  assert.equal(unknown.hookRate, 0.4);
  const [knownVideo, other] = source.insights;
  const withUnknownDelivery = (impressions: string) =>
    realCampaignRows(
      { ...source, insights: [knownVideo!, { ...other!, video: null, impressions, actions: [] }] },
      range,
      filters,
    )[0]!.metrics.hookRate;
  assert.equal(withUnknownDelivery('200'), null);
  assert.equal(withUnknownDelivery('0'), 0.3);
});

test('não perde conversões de anúncio ou hora sem gasto dentro de campanha elegível no dia', () => {
  const zero = {
    ...snapshot.insights[0]!,
    adId: '2',
    adName: 'Ad atribuído',
    spend: '0',
    impressions: '0',
    actions: [{ action_type: 'purchase', value: '1' }],
    actionValues: [{ action_type: 'purchase', value: '20' }],
  };
  const source: RealCampaignSnapshot = {
    ...snapshot,
    purchaseClassification: 'front_only_user_confirmed',
    campaigns: [snapshot.campaigns[0]!],
    insights: [{ ...snapshot.insights[0]!, adId: '1', adName: 'Ad com gasto' }, zero],
  };
  const ads = realCampaignRows(source, range, { ...filters, level: 'ads' });
  assert.equal(ads.length, 2);
  assert.equal(trafficTotals(ads).frontSales, 1);
  const hourly = { ...source, insights: [zero] };
  assert.equal(realCampaignRows(hourly, range, filters).length, 0);
  const window = realCampaignRows(hourly, range, { ...filters, includeAttributedZeroSpend: true });
  assert.equal(window.length, 1);
  assert.equal(window[0]!.metrics.frontSales, 1);
  assert.equal(window[0]!.metrics.spend, 0);
});
