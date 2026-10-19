import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL(
    '../src/components/tracking/tracking-live-console-render-attribution-view.tsx',
    import.meta.url,
  ),
  'utf8',
);
test('campaign attribution shows advertiser page separately, preserving original metrics', () => {
  assert.match(source, /'Campanha',\s+'Página anunciante',\s+'Conjunto'/);
  assert.match(source, /row\.page_name \|\| 'Não informada'/);
  assert.match(source, /row\.page_id && \(\s*<p[^>]*>\s*ID: \{row\.page_id\}/);
  assert.doesNotMatch(source, /row\.page_name \|\| row\.(campaign_name|ad_name)/);
  for (const field of [
    'unique_ad_clicks',
    'visitors',
    'unique_checkouts',
    'orders',
    'paid_orders',
    'paid_revenue_minor',
  ])
    assert.ok(source.includes(`row.${field}`));
});
