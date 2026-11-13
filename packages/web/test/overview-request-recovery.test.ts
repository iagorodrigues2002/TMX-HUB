import assert from 'node:assert/strict';
import test from 'node:test';
import { endpoints } from '../src/lib/api-client/endpoints-tracking-finance';
import { makeQueryClient } from '../src/lib/query-client';

test('overview recovers transient failures without retrying permission errors or losing cached data', async () => {
  const original = globalThis.fetch;
  const client = makeQueryClient();
  client.setDefaultOptions({ queries: { ...client.getDefaultOptions().queries, retryDelay: 0 } });
  const data = { from: '2026-11-12', to: '2026-11-12', offers: [], accounts: [], totals: null };
  let calls = 0;
  try {
    globalThis.fetch = async () => {
      calls++;
      return calls === 1 ? new Response('', { status: 502 }) : Response.json(data);
    };
    const options = {
      queryKey: ['overview-financial', data.from, data.to, 'general'],
      queryFn: ({ signal }: { signal: AbortSignal }) => endpoints.getTrackingOverview(data.from, data.to, 'general', signal),
      staleTime: 0,
    };
    assert.deepEqual(await client.fetchQuery(options), data);
    assert.equal(calls, 2);
    calls = 0;
    globalThis.fetch = async () => { calls++; return new Response('', { status: 403 }); };
    await assert.rejects(client.fetchQuery(options));
    assert.equal(calls, 1);
    assert.deepEqual(client.getQueryData(options.queryKey), data);

    calls = 0;
    globalThis.fetch = async () => { calls++; return new Response('', { status: 503 }); };
    await assert.rejects(client.fetchQuery(options));
    assert.equal(calls, 3);
    assert.deepEqual(client.getQueryData(options.queryKey), data);

    calls = 0;
    globalThis.fetch = async (_url, init) => {
      calls++;
      return new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true }));
    };
    const pending = client.fetchQuery(options).catch(() => undefined);
    await client.cancelQueries({queryKey: options.queryKey});
    await pending;
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; client.clear(); }
});

test('overview bounds a stalled response and recovers on the next attempt', async () => {
  const original = globalThis.fetch;
  const originalTimeout = AbortSignal.timeout;
  const client = makeQueryClient();
  client.setDefaultOptions({ queries: { ...client.getDefaultOptions().queries, retryDelay: 0 } });
  let calls = 0;
  try {
    AbortSignal.timeout = (ms) => {
      assert.equal(ms, 30_000);
      const controller = new AbortController();
      setTimeout(() => controller.abort(new DOMException('Timed out', 'TimeoutError')), 5);
      return controller.signal;
    };
    globalThis.fetch = async (_url, init) => {
      calls++;
      if (calls > 1) return Response.json({ offers: [], accounts: [], totals: null });
      return new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true }));
    };
    const result = await client.fetchQuery({ queryKey: ['timeout'], queryFn: ({signal}) => endpoints.getTrackingOverview(undefined, undefined, 'general', signal) });
    assert.deepEqual(result.offers, []);
    assert.equal(calls, 2);
  } finally { globalThis.fetch = original; AbortSignal.timeout = originalTimeout; client.clear(); }
});
