import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { OverviewDataset } from '../src/components/overview/overview-dashboard-support';
import { INTRADAY_RANGE_LIMIT_MESSAGE } from '../src/lib/intraday-range';
import { PrivacyProvider } from '../src/lib/privacy-context';

register(
  `data:text/javascript,${encodeURIComponent(`export async function load(url, context, nextLoad) {
    if (url.endsWith('.module.css')) return { format: 'module', shortCircuit: true,
      source: 'export default new Proxy({}, { get: (_, key) => String(key) });' };
    return nextLoad(url, context);
  }`)}`,
  import.meta.url,
);
const { Dataset } = await import('../src/components/overview/overview-dashboard-dataset');

test('unsupported legacy range shows its limit, hides stale bars and preserves financial totals', () => {
  const dataset: OverviewDataset = {
    key: 'synthetic',
    label: 'Escopo sintético',
    currency: 'BRL',
    offerCount: 1,
    totals: {
      spend: 0,
      sales: 12,
      revenue: 1200,
      ic: 20,
      cpa: 0,
      icCpa: 0,
      conversionRate: 0.6,
      roas: null,
    },
    clicks: 40,
    pageViews: 50,
    conversionRate: 0.24,
    daily: [],
    intraday: [{ key: 'old', label: 'STALE_WINDOW_DO_NOT_SHOW', value: 999, secondary: 1 }],
    intradayUnavailableReason: INTRADAY_RANGE_LIMIT_MESSAGE,
    finance: null,
  };
  const html = renderToStaticMarkup(
    <PrivacyProvider>
      <Dataset dataset={dataset} salesView="general" />
    </PrivacyProvider>,
  );
  assert.match(html, /até 60 dias/);
  assert.doesNotMatch(html, /STALE_WINDOW_DO_NOT_SHOW/);
  assert.match(html, /1\.200,00/);
  assert.match(html, /Receita bruta/);
});
