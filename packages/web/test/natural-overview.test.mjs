import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
const source = (file) =>
  readFileSync(new URL(`../src/components/overview/${file}`, import.meta.url), 'utf8');
test('natural switch preserves period state and existing general sources', () => {
  const s = source('overview-dashboard.tsx');
  assert.match(s, /setSalesView/);
  assert.match(s, /aria-pressed/);
  assert.match(s, /Visão natural/);
  assert.match(
    s,
    /apiClient.getTrackingOverview\(queryPeriod.from, queryPeriod.to, queryView, signal\)/,
  );
  assert.match(s, /useSettledOverviewFilters\(period, salesView\)/);
  assert.match(s, /apiClient.getOfferSnapshots/);
  assert.match(s, /SalesComposition/);
});
test('natural ARR respects privacy and excludes unauditable money and history explicitly', () => {
  const s = source('sales-composition.tsx');
  assert.match(source('overview-dashboard-dataset.tsx'), /usePrivacy/);
  assert.match(source('overview-dashboard-dataset.tsx'), /isPrivate/);
  assert.match(s, /unidentified_orders/);
  assert.match(s, /unclassified_orders/);
  assert.match(source('overview-dashboard-dataset.tsx'), /label="ARPU"/);
  assert.match(source('overview-dashboard-dataset.tsx'), /clientes únicos/i);
});
test('both views share the existing dashboard renderer and ARPU is a KPI card', () => {
  const dashboard = source('overview-dashboard.tsx');
  assert.doesNotMatch(dashboard, /<SalesComposition/);
  assert.match(dashboard, /salesView=\{queryView\}/);
  const dataset = source('overview-dashboard-dataset.tsx');
  assert.match(dataset, /label="ARPU"/);
  assert.match(dataset, /dataset.arpu/);
});
