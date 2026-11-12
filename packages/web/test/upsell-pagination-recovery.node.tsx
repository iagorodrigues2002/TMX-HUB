import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useUpsellQueries } from '../src/components/tracking/sections/journey/tracking-content/use-upsell-queries';
import { apiClient } from '../src/lib/api-client';

const { JSDOM } = createRequire(new URL('../../core/package.json', import.meta.url))('jsdom');

test('failed last-page request preserves buyers and total without exposing another offer', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Number.POSITIVE_INFINITY } },
  });
  const root = createRoot(document.getElementById('root')!);
  const original = apiClient.getTrackingUpsellIdentities;
  let rejectPage: (error: Error) => void = () => {};
  apiClient.getTrackingUpsellIdentities = () =>
    new Promise((_resolve, reject) => {
      rejectPage = reject;
    });
  const firstPage = { total: 1477, offset: 0, limit: 20, items: [] };
  client.setQueryData(['tracking-upsell-identities', 'offer-a', 'all', 0, 20], firstPage);
  let observed: ReturnType<typeof useUpsellQueries>;
  function Probe({ offerId, offset }: { offerId: string; offset: number }) {
    observed = useUpsellQueries({
      offerId,
      section: 'upsells',
      trackingFrom: '2026-11-12',
      trackingTo: '2026-11-12',
      upsellIdentityOffset: offset,
      upsellIdentityPageSize: 20,
      setUpsellIdentityOffset: () => {},
      upsellBuyerFilter: 'all',
      upsellTestFilter: 'all',
      editingUpsellStageId: null,
      upsellStageKey: 'upsell_1',
      setUpsellStageKey: () => {},
      setUpsellStageName: () => {},
    });
    return null;
  }
  const render = async (offerId: string, offset: number) => {
    client.setQueryData(['tracking-advanced', offerId], {});
    client.setQueryData(['tracking-upsells', offerId, '2026-11-12', '2026-11-12'], { stages: [] });
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <Probe offerId={offerId} offset={offset} />
        </QueryClientProvider>,
      );
    });
  };
  try {
    await render('offer-a', 0);
    await render('offer-a', 1460);
    assert.equal(observed!.upsellIdentities.data?.total, 1477);
    await act(async () => {
      rejectPage(new Error('Gateway timeout'));
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    assert.equal(observed!.upsellIdentities.isError, true);
    assert.equal(observed!.upsellIdentities.data?.total, 1477);
    await render('offer-b', 0);
    assert.equal(observed!.upsellIdentities.data, undefined);
  } finally {
    await act(async () => root.unmount());
    client.clear();
    apiClient.getTrackingUpsellIdentities = original;
    dom.window.close();
  }
});
