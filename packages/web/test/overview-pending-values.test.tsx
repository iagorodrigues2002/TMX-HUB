import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Kpi } from '../src/components/ui/kpi';
import { DataPendingContext } from '../src/lib/data-pending';

test('pending metrics preserve their cards and labels while clearing both visible and accessible values', () => {
  const metric = React.createElement(Kpi, {
    label: 'Receita bruta',
    value: 'R$ 987.654,32',
    countUp: { value: 987654.32, format: String },
  });
  const settled = renderToStaticMarkup(metric);
  const waiting = renderToStaticMarkup(
    React.createElement(DataPendingContext.Provider, { value: true }, metric),
  );
  assert.match(settled, /R\$ 987\.654,32/);
  assert.doesNotMatch(waiting, /987\.654|987654/);
  assert.match(waiting, /Receita bruta/);
  assert.match(waiting, /tmx-kpi-card/);
  assert.match(waiting, /—/);
});

test('period loading does not replace the dashboard with gray skeletons or reuse another scope', () => {
  const source = readFileSync(
    new URL('../src/components/overview/overview-dashboard.tsx', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(source, /OverviewLoadingSkeleton/);
  assert.match(source, /committed\.current\?\.identity === identity/);
  assert.match(source, /DataPendingContext\.Provider value=\{isLoading\}/);
  const tracking = readFileSync(
    new URL('../src/components/tracking/tracking-workspace.tsx', import.meta.url),
    'utf8',
  );
  assert.match(tracking, /data-surface="tracking"\s+data-motion-screen=/);
  assert.match(tracking, /<aside data-motion-panel|<aside\s+data-motion-panel/);
  const dates = readFileSync(
    new URL(
      '../src/components/tracking/sections/journey/tracking-content/render-tracking-dates.tsx',
      import.meta.url,
    ),
    'utf8',
  );
  assert.match(dates, /data-motion-panel/);
});
