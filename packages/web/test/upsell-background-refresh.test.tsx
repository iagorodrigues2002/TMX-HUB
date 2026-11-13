import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { renderUpsellIdentityFilters } from '../src/components/tracking/sections/journey/tracking-content/render-upsell-identity-filters';
import type { TrackingContentContext } from '../src/components/tracking/sections/journey/tracking-content/tracking-content-context';

test('background refresh keeps the same markup and initial loading remains visible', () => {
  const view = (fetching: boolean, cached: boolean) => renderToStaticMarkup(renderUpsellIdentityFilters({
    canManage: false, upsellBuyerFilter: 'all', upsellTestFilter: 'all', filteredUpsellIdentities: [],
    upsellIdentityOffset: 0, upsellIdentityPageSize: 20,
    upsellIdentities: { isFetching: fetching, isError: false, data: cached ? { offset: 0, total: 0, items: [] } : undefined },
    setUpsellIdentityOffset() {}, setUpsellIdentityPageSize() {}, setUpsellBuyerFilter() {}, setUpsellTestFilter() {},
  } as unknown as TrackingContentContext));
  assert.equal(view(true, true), view(false, true));
  assert.doesNotMatch(view(true, true), /Carregando página/);
  assert.match(view(true, false), /Carregando página/);
});
