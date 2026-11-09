import assert from 'node:assert/strict';
import test from 'node:test';
import {
  REPORT_TODAY,
  type ReportRecord,
  allReports,
  defaultTrafficColumns,
  gateways,
  groupReportRows,
  reportCoverage,
  reportMetrics,
  reportPresets,
  selectReportRecords,
  splitReportAmount,
} from '../src/components/traffic/traffic-reports-model';

const range = { from: '2026-11-01', to: REPORT_TODAY };
const close = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 0.000001, `${actual} != ${expected}`);

test('gateways particionam sem duplicar gasto e índices usam totais, não médias', () => {
  const records = selectReportRecords(allReports, range);
  const totals = reportMetrics(records);
  const main = reportMetrics(selectReportRecords({ ...allReports, gateway: gateways[0] }, range));
  const expansion = reportMetrics(
    selectReportRecords({ ...allReports, gateway: gateways[1] }, range),
  );
  const third = reportMetrics(selectReportRecords({ ...allReports, gateway: gateways[2] }, range));
  close(totals.spend, main.spend + expansion.spend + third.spend);
  close(totals.revenue, main.revenue + expansion.revenue + third.revenue);
  close(totals.finalResult!, main.finalResult! + expansion.finalResult! + third.finalResult!);
  close(totals.cpc!, totals.spend / totals.clicks);
  close(totals.cpm!, (totals.spend / totals.impressions) * 1000);
  close(totals.checkoutConversion!, totals.frontSales! / totals.checkouts);
  close(totals.conversionRate!, totals.frontSales! / totals.pageViews);
  close(totals.cpa!, totals.spend / totals.frontSales!);
  assert.ok(totals.frontSales! < totals.sales);
  close(totals.roas!, totals.revenue / totals.spend);
  const filtered = selectReportRecords({ gateway: 'Explodely', account: 'account-1-0-1' }, range);
  assert.ok(filtered.length > 0);
  assert.ok(
    filtered.every((row) => row.ad.gateway === 'Explodely' && row.ad.account === 'account-1-0-1'),
  );
});

test('resultado final desconta cada dedução uma vez e mantém mídia separada', () => {
  const source = selectReportRecords(allReports, range)[0]!;
  const amounts = {
    ...source.amounts,
    revenue: 100000,
    fees: 10000,
    refunds: 5000,
    penalties: 1000,
    reserve: 8000,
    spend: 20000,
  };
  const metrics = reportMetrics([{ amounts }]);
  assert.equal(metrics.finalResult, 760);
  assert.equal(metrics.afterMedia, 560);
  assert.equal(metrics.roas, 5);
  assert.equal(metrics.roi, 2.8);
  assert.equal(reportMetrics([{ amounts: { ...amounts, frontSales: null } }]).cpa, null);
  assert.equal(reportMetrics([{ amounts: { ...amounts, fees: null } }]).finalResult, null);
  assert.equal(reportMetrics([{ amounts: { ...amounts, reserve: null } }]).afterMedia, null);
  assert.equal(reportMetrics([{ amounts: { ...amounts, refunds: 150000 } }]).finalResult, -690);
});

test('janelas, dias, campanhas, conjuntos e anúncios reconciliam o mesmo investimento', () => {
  const records = selectReportRecords(allReports, range);
  const totals = reportMetrics(records);
  for (const level of ['windows', 'daily', 'campaigns', 'adsets', 'ads'] as const) {
    const rows = groupReportRows(records, level);
    close(
      rows.reduce((sum, row) => sum + row.metrics.spend, 0),
      totals.spend,
    );
    close(
      rows.reduce((sum, row) => sum + row.metrics.finalResult!, 0),
      totals.finalResult!,
    );
    assert.equal(
      rows.reduce((sum, row) => sum + row.metrics.sales, 0),
      totals.sales,
    );
    assert.equal(
      rows.reduce((sum, row) => sum + row.metrics.frontSales!, 0),
      totals.frontSales,
    );
  }
  assert.equal(groupReportRows(records, 'windows').length, 12);
  assert.equal(groupReportRows(records, 'daily').length, 8);
  for (const value of [0, 1, 19, 99999])
    assert.equal(
      splitReportAmount(value).reduce((sum, item) => sum + item, 0),
      value,
    );
});

test('colunas seguem a ordem operacional solicitada', () => {
  assert.deepEqual(defaultTrafficColumns, [
    'spend',
    'frontSales',
    'cpa',
    'checkouts',
    'costCheckout',
    'roi',
    'cpm',
    'cpc',
    'hookRate',
  ]);
});

test('imagem não recebe hook rate e ausência de vídeo não é convertida em zero', () => {
  const records = selectReportRecords(allReports, range);
  assert.equal(reportMetrics(records.filter((row) => row.ad.format === 'Imagem')).hookRate, null);
  const videos = records.filter((row) => row.ad.format === 'Vídeo');
  assert.ok(reportMetrics(videos).hookRate! > 0);
  assert.equal(
    reportMetrics([{ ...videos[0]!, amounts: { ...videos[0]!.amounts, videoViews: null } }])
      .hookRate,
    null,
  );
  const metrics = reportMetrics([]);
  for (const key of [
    'cpc',
    'cpm',
    'ctr',
    'cpa',
    'hookRate',
    'roas',
    'conversionRate',
    'checkoutConversion',
  ] as const)
    assert.equal(metrics[key], null);
});

test('datas personalizadas, presets e falta de cobertura são explícitos', () => {
  const records = selectReportRecords(allReports, { from: '2026-10-03', to: '2026-10-04' });
  assert.ok(records.every((row) => row.date >= '2026-10-03' && row.date <= '2026-10-04'));
  assert.equal(new Set(records.map((row) => row.date)).size, 2);
  assert.equal(reportCoverage({ from: '2026-01-01', to: '2026-02-01' }), null);
  assert.equal(reportCoverage({ from: '2026-01-01', to: REPORT_TODAY })!.partial, true);
  assert.equal(
    reportPresets.find((preset) => preset.label === 'Hoje')!.getRange().from,
    REPORT_TODAY,
  );
  assert.deepEqual(reportPresets.find((preset) => preset.label === 'Mês passado')!.getRange(), {
    from: '2026-10-01',
    to: '2026-10-31',
  });
});

test('nomes de anúncios repetidos continuam separados por ID', () => {
  const [one, two] = selectReportRecords(allReports, range);
  const records: ReportRecord[] = [
    one!,
    { ...two!, ad: { ...two!.ad, id: 'other-ad', name: one!.ad.name } },
  ];
  assert.equal(groupReportRows(records, 'ads').length, 2);
});
