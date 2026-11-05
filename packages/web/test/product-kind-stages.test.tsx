import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { QueryClient } from '@tanstack/react-query';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { renderProductKinds } from '../src/components/tracking/sections/journey/tracking-content/render-product-kinds';
import type { TrackingContentContext } from '../src/components/tracking/sections/journey/tracking-content/tracking-content-context';
import { TRACKING_DASHBOARD_STALE_TIME } from '../src/components/tracking/tracking-query';

test('opening product classification directly loads configured upsell stages for that offer', async () => {
  const source = readFileSync(
    new URL(
      '../src/components/tracking/sections/journey/tracking-content/use-upsell-queries.tsx',
      import.meta.url,
    ),
    'utf8',
  );
  const config = source.match(/const upsellIntelligence = useQuery\((\{[\s\S]*?\})\);/);
  assert.ok(config);
  const calls: unknown[] = [];
  const apiClient = {
    getTrackingUpsells: async (...args: unknown[]) => {
      calls.push(args);
      return { stages: [{ stage_key: 'upsell_5', name: 'Upsell 5' }] };
    },
  };
  const options = (section: string) =>
    new Function(
      'section',
      'offerId',
      'trackingFrom',
      'trackingTo',
      'apiClient',
      'TRACKING_DASHBOARD_STALE_TIME',
      `return (${config[1]})`,
    )(section, 'offer-cmd', '2026-11-05', '2026-11-05', apiClient, TRACKING_DASHBOARD_STALE_TIME);
  assert.equal(options('utmify').enabled, true);
  assert.equal(options('upsells').enabled, true);
  assert.equal(options('overview').enabled, false);
  const client = new QueryClient();
  try {
    const data = await client.fetchQuery<{ stages: { stage_key: string }[] }>(options('utmify'));
    assert.equal(data.stages[0].stage_key, 'upsell_5');
    assert.deepEqual(calls, [['offer-cmd', { from: '2026-11-05', to: '2026-11-05' }]]);
  } finally {
    client.clear();
  }
});

function fixture(state: 'ready' | 'pending' | 'error' = 'ready') {
  const selected: Record<string, string> = {};
  const saved: unknown[] = [];
  const context = {
    canManage: true,
    productKinds: {
      data: {
        unmapped: [{ product_id: 'cmd-up05', product_name: 'Ale Up05', orders: 1 }],
        mapped: [],
      },
    },
    productKindSelection: selected,
    setProductKindSelection: (update: (previous: typeof selected) => typeof selected) =>
      Object.assign(selected, update(selected)),
    upsellIntelligence: {
      isPending: state === 'pending',
      isError: state === 'error',
      data:
        state === 'ready'
          ? {
              stages: [
                { stage_key: 'upsell_1', name: 'Upsell 1' },
                { stage_key: 'upsell_5', name: 'Upsell 5' },
              ],
            }
          : undefined,
      refetch() {},
    },
    saveProductKind: { isPending: false, mutate: (input: unknown) => saved.push(input) },
  } as unknown as TrackingContentContext;
  return { context, saved };
}

test('Upsell 5 can be selected and submitted without changing Front or Upsell 1 mapping', () => {
  const { context, saved } = fixture();
  const html = renderToStaticMarkup(renderProductKinds(context));
  assert.match(html, /value="front"/);
  assert.match(html, /value="upsell"/);
  assert.match(html, /value="upsell_5">Upsell 5/);
  const find = (
    node: unknown,
    predicate: (element: React.ReactElement) => boolean,
  ): React.ReactElement | undefined => {
    if (!React.isValidElement(node)) return;
    if (predicate(node)) return node;
    for (const child of React.Children.toArray(
      (node.props as { children?: React.ReactNode }).children,
    )) {
      const result = find(child, predicate);
      if (result) return result;
    }
  };
  const select = find(renderProductKinds(context), (node) => node.type === 'select');
  assert.ok(select);
  (select.props as { onChange: (event: unknown) => void }).onChange({
    target: { value: 'upsell_5' },
  });
  const button = find(
    renderProductKinds(context),
    (node) => (node.props as { children?: unknown }).children === 'Classificar',
  );
  assert.ok(button);
  (button.props as { onClick: () => void }).onClick();
  assert.deepEqual(saved, [{ product_id: 'cmd-up05', kind: 'upsell_5', label: 'Ale Up05' }]);
});

for (const state of ['pending', 'error'] as const) {
  test(`classification waits for stage metadata when ${state}`, () => {
    const html = renderToStaticMarkup(renderProductKinds(fixture(state).context));
    assert.match(html, /<select[^>]*disabled=""/);
    const button = html
      .match(/<button\b[^>]*>[\s\S]*?<\/button>/g)
      ?.find((node) => node.includes('Classificar'));
    assert.ok(button);
    assert.match(button, /^<button[^>]*disabled=""/);
    assert.match(html, state === 'pending' ? /Carregando etapas/ : /Não foi possível carregar/);
    if (state === 'error') assert.match(html, /Tentar novamente/);
  });
}
