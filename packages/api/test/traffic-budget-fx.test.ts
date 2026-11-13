import { afterEach, expect, it, vi } from 'vitest';
import { convertBudget, freshBudgetFx } from '@page-cloner/shared/budget-fx';
import { loadBudgetFx } from '../src/services/traffic-budget-fx.js';
const quote = { id: 'quote', fetchedAt: new Date().toISOString(), quotedAt: new Date().toISOString(), rates: { BRL: 1, USD: 5, EUR: 6 } };
afterEach(() => vi.unstubAllGlobals());
it('converts the selected currency to account cents and reprices display without changing Meta', () => {
  expect(convertBudget(10000, 'BRL', 'USD', quote)).toBe(2000);
  expect(convertBudget(2000, 'USD', 'BRL', quote)).toBe(10000);
  expect(convertBudget(2000, 'USD', 'BRL', { ...quote, rates: { ...quote.rates, USD: 5.25 } })).toBe(10500);
  expect(convertBudget(10000, 'BRL', 'EUR', quote)).toBe(1667);
  expect(() => convertBudget(100, 'COP', 'BRL', quote)).toThrow();
  expect(freshBudgetFx({ ...quote, fetchedAt: '2020-01-01' })).toBe(false);
});
it('shares minute cache, preserves stale data on failure and keeps preview offline', async () => {
  const values = new Map<string, string>();
  const redis = { get: async (k: string) => values.get(k) ?? null, set: async (k: string, v: string, ...args: unknown[]) => {
    if (args.includes('NX') && values.has(k)) return null;
    values.set(k, v); return 'OK';
  } };
  const fetcher = vi.fn(async () => new Response(JSON.stringify(Object.fromEntries(['USD','EUR','GBP'].map(code => [code+'BRL', { bid: '5', timestamp: String(Math.floor(Date.now()/1000)) }])))));
  vi.stubGlobal('fetch', fetcher);
  const first = await loadBudgetFx(redis as never);
  expect(await loadBudgetFx(redis as never)).toEqual(first);
  expect(fetcher).toHaveBeenCalledTimes(1);
  values.set('traffic-management-v1:fx', JSON.stringify({ ...first, fetchedAt: '2020-01-01' }));
  values.delete('traffic-management-v1:fx:refresh');
  fetcher.mockRejectedValueOnce(Error('offline')).mockRejectedValueOnce(Error('offline'));
  expect(freshBudgetFx(await loadBudgetFx(redis as never))).toBe(false);
  await loadBudgetFx(redis as never, true);
  expect(fetcher).toHaveBeenCalledTimes(3);
});
it('uses a validated alternative quote on provider quota failure and preserves its actual publication time', async () => {
  const redis = { get: async () => null, set: vi.fn(async () => 'OK') };
  const published = Math.floor(Date.now() / 1000) - 3600;
  const fetcher = vi.fn().mockResolvedValueOnce(new Response('{}', { status: 429 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ result: 'success', base_code: 'BRL', time_last_update_unix: published, rates: { BRL: 1, USD: 0.2, EUR: 0.16, GBP: 0.125 } })));
  vi.stubGlobal('fetch', fetcher);
  const result = await loadBudgetFx(redis as never);
  expect(result.rates).toEqual({ BRL: 1, USD: 5, EUR: 6.25, GBP: 8 });
  expect(result.quotedAt).toBe(new Date(published * 1000).toISOString());
  expect(convertBudget(80000, 'USD', 'BRL', result)).toBe(400000);
  expect(redis.set).toHaveBeenCalledTimes(3);
});
