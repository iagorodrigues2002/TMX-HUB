import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  importErrorPresentation,
  metricPresentation,
  sourceAccountLabel,
} from '../src/components/ads-intelligence/metric-presentation';

test('ROAS uses 1x and ROI uses zero as media break-even, not positive sign alone', () => {
  assert.equal(metricPresentation('roas', 0.9).cue, '▼');
  assert.equal(metricPresentation('roas', 1).cue, '=');
  assert.equal(metricPresentation('roas', 1.1).cue, '▲');
  assert.equal(metricPresentation('roi', -10).cue, '▼');
  assert.equal(metricPresentation('roi', 0).cue, '=');
  assert.equal(metricPresentation('roi', 10).cue, '▲');
});
test('privacy suppresses color, status and direction for every hidden financial value', () => {
  for (const key of ['roas', 'roi', 'revenue', 'spend', 'cpc', 'cpm']) {
    const hidden = metricPresentation(key, -5, true);
    assert.deepEqual(hidden, metricPresentation(key, 15, true));
    assert.equal(hidden.cue, '');
    assert.equal(hidden.tone, 'text-foreground');
    assert.equal(hidden.description, 'Valor oculto');
  }
});
test('unknown metrics are neutral and informational rates invent no performance threshold', () => {
  assert.equal(metricPresentation('roas', null).cue, '');
  assert.equal(metricPresentation('roi', Number.NaN).tone, 'text-muted-foreground');
  assert.equal(metricPresentation('ctr', 0.2).tone, metricPresentation('ctr', 90).tone);
  assert.equal(metricPresentation('hook_rate', 0.2).cue, '');
});
test('sticky first column is opaque and nested tables share explicit full column width', () => {
  const [center, support, batchRow, importStatus] = [
    'ads-intelligence-center.tsx',
    'ads-intelligence-center-support.tsx',
    'ads-intelligence-center-batch-row.tsx',
    'ads-intelligence-center-render-import-status.tsx',
  ].map((file) =>
    readFileSync(new URL(`../src/components/ads-intelligence/${file}`, import.meta.url), 'utf8'),
  );
  const source = [center, support, batchRow, importStatus].join('\n');
  assert.match(source, /sticky left-0 bg-\[var\(--color-background\)\]/);
  assert.equal(
    (source.match(/style=\{\{\s*width:\s*tableWidth,\s*minWidth:\s*tableWidth\s*\}\}/g) || [])
      .length,
    2,
  );
  assert.ok(
    center.indexOf('aria-label="Filtros dos anúncios"') < center.indexOf('renderImportStatus({'),
  );
  assert.match(importStatus, /aria-label="Estado da importação"/);
  assert.match(source, /<details className="space-y-3 rounded-xl/);
  assert.match(source, /className="min-h-0 overflow-clip"/);
  assert.doesNotMatch(source, /min-h-0 overflow-hidden/);
});
test('metric colors follow explicit app theme independently from operating-system dark mode', () => {
  const css = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8');
  const helper = readFileSync(
    new URL('../src/components/ads-intelligence/metric-presentation.ts', import.meta.url),
    'utf8',
  );
  assert.match(css, /html\[data-theme="light"\] \.ads-intelligence-metrics/);
  assert.match(css, /--ads-positive: #047857/);
  assert.match(css, /--ads-positive: #6ee7b7/);
  assert.doesNotMatch(helper, /dark:/);
  assert.match(metricPresentation('roas', 2).tone, /var\(--ads-positive\)/);
});
test('only known legacy partial summary is normalized; paused and real upstream errors remain untouched', () => {
  const legacy =
    'Cobertura parcial: contas com falha estão identificadas. ROAS/ROI indisponíveis até reparar as lacunas.';
  const fixed = importErrorPresentation('partial', legacy);
  assert.equal(fixed.warning, true);
  assert.match(fixed.message, /calculados com os custos conhecidos/);
  assert.deepEqual(importErrorPresentation('paused', legacy), { message: legacy, warning: false });
  assert.deepEqual(importErrorPresentation('retry_wait', 'UPSTREAM_ERROR HTTP 500'), {
    message: 'UPSTREAM_ERROR HTTP 500',
    warning: false,
  });
  assert.deepEqual(importErrorPresentation('partial', 'Outra falha'), {
    message: 'Outra falha',
    warning: false,
  });
});
test('advertiser page details use explicit source name/id without guessing the ad account', () => {
  const source = readFileSync(
    new URL(
      '../src/components/ads-intelligence/ads-intelligence-center-batch-row.tsx',
      import.meta.url,
    ),
    'utf8',
  );
  assert.match(
    source,
    /Página anunciante\s*<\/dt>\s*<dd>\{source\.page_name \|\| 'Não informada'\}/,
  );
  assert.match(source, /source\.page_id && \(\s*<dd className="break-all">ID: \{source\.page_id\}/);
  assert.doesNotMatch(source, /source\.page_name \|\| source\.account_name/);
});
test('historical source snapshots with identical IDs and renamed entities keep distinct React keys', () => {
  const source = readFileSync(
    new URL(
      '../src/components/ads-intelligence/ads-intelligence-center-batch-row.tsx',
      import.meta.url,
    ),
    'utf8',
  );
  // The API deduplicates complete source snapshots, including their historical names.
  assert.match(source, /<dl\s+key=\{JSON\.stringify\(source\)\}/);
  const original = {
    platform: 'meta',
    account_id: 'account-1',
    campaign_id: 'campaign-1',
    campaign_name: 'Original campaign',
    adset_id: 'adset-1',
    adset_name: 'Original ad set',
    ad_id: 'ad-1',
    ad_name: 'Original ad',
    page_id: 'page-1',
    page_name: 'Original page',
  };
  for (const name of ['campaign_name', 'adset_name', 'ad_name', 'page_name'] as const) {
    const renamed = { ...original, [name]: 'Renamed entity' };
    const snapshots = [original, renamed];
    assert.equal(new Set(snapshots.map((snapshot) => JSON.stringify(snapshot))).size, 2, name);
  }
});
test('consolidated ads count distinct platform/account identities, not campaign sources', () => {
  assert.equal(
    sourceAccountLabel([
      { platform: 'meta', account_id: '1', account_name: 'Mainex' },
      { platform: 'meta', account_id: '1', account_name: 'Mainex' },
    ]),
    'Conta: Mainex',
  );
  assert.equal(
    sourceAccountLabel([
      { platform: 'meta', account_id: '1' },
      { platform: 'meta', account_id: '2' },
    ]),
    '2 contas de anúncios',
  );
  assert.equal(
    sourceAccountLabel([
      { platform: 'meta', account_id: '1' },
      { platform: 'google', account_id: '1' },
    ]),
    '2 contas de anúncios',
  );
  assert.equal(sourceAccountLabel([{}]), 'Conta não informada');
  assert.equal(sourceAccountLabel([{ account_name: 'Mainex' }]), 'Conta não informada');
  assert.equal(
    sourceAccountLabel([{ platform: 'meta', account_id: '1', account_name: 'Mainex' }, {}]),
    'Conta: Mainex + conta não informada',
  );
});
