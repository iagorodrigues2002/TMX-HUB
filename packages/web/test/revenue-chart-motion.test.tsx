import assert from 'node:assert/strict';
import { register } from 'node:module';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// node:test does not process CSS modules; Next validates the real stylesheet at build time.
register(
  `data:text/javascript,${encodeURIComponent(`export async function load(url, context, nextLoad) {
    if (url.endsWith('.module.css')) return { format: 'module', shortCircuit: true,
      source: 'export default new Proxy({}, { get: (_, key) => String(key) });' };
    return nextLoad(url, context);
  }`)}`,
  import.meta.url,
);
const { RevenueChart } = await import(
  '../src/components/overview/overview-dashboard-revenue-chart'
);

const props = {
  title: 'Receita',
  description: 'Período',
  emptyMessage: 'Sem série',
  currency: 'BRL',
};
const points = [{ key: 'day-1', label: '27/10', value: 100, secondary: 2 }];

test('chart motion is opt-in and preserves exact financial values', () => {
  const original = renderToStaticMarkup(<RevenueChart {...props} points={points} />);
  const animated = renderToStaticMarkup(<RevenueChart {...props} points={points} animated />);
  assert.match(original, /data-animated="false"/);
  assert.match(animated, /data-animated="true"/);
  assert.match(animated, /tabindex="0"/);
  assert.match(animated, /100,00/);
  assert.match(animated, /2 vendas/);
  assert.match(animated, /<table/);
});

test('empty chart does not manufacture revenue bars', () => {
  const html = renderToStaticMarkup(<RevenueChart {...props} points={[]} animated />);
  assert.match(html, /Sem série/);
  assert.doesNotMatch(html, /data-revenue-bar/);
});
