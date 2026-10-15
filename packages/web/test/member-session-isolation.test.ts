import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { QueryClient } from '@tanstack/react-query';
import { readPersonalStorage, setPersonalStorageOwner, writePersonalStorage } from '../src/lib/personal-storage';
import { resetSessionData } from '../src/lib/session-data';
import { useSelectionStore } from '../src/lib/selection-store';
import { listHistory, pushHistory } from '../src/lib/webhook/storage';
import { listPresets } from '../src/lib/upsell/storage';
import { loadPrivatePreview } from '../src/lib/private-preview';

test('personal browser records never fall back to a previous member or legacy unowned data', () => {
  const records = new Map<string, string>();
  const storage = { getItem: (key: string) => records.get(key) ?? null, setItem: (key: string, value: string) => records.set(key, value), removeItem: (key: string) => records.delete(key) };
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: storage, sessionStorage: storage } });
  try {
    records.set('tmx-hub:webhook-history:v1', '[{"url":"https://legacy.example"}]');
    records.set('tmx-hub:upsell-presets:v1', '[{"name":"legacy-private"}]');
    setPersonalStorageOwner('member-a');
    assert.deepEqual(listHistory(), []);
    assert.deepEqual(listPresets(), []);
    pushHistory({ templateId: null, url: 'https://a.example/private', status: 200, ok: true, durationMs: 1 });
    writePersonalStorage('offer', 'offer-a');
    setPersonalStorageOwner('member-b');
    assert.deepEqual(listHistory(), []);
    assert.equal(readPersonalStorage('offer'), null);
    writePersonalStorage('offer', 'offer-b');
    setPersonalStorageOwner('member-a');
    assert.equal(listHistory().length, 1);
    assert.equal(readPersonalStorage('offer'), 'offer-a');
    setPersonalStorageOwner(null);
    assert.deepEqual(listHistory(), []);
    assert.equal(readPersonalStorage('offer'), null);
  } finally {
    setPersonalStorageOwner(null);
    if (original) Object.defineProperty(globalThis, 'window', original);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});

test('session boundary removes cached data, mutations and editor selection and cancels in-flight A requests', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(['offers'], [{ id: 'private-offer-a' }]);
  client.getMutationCache().build(client, { mutationKey: ['private-mutation-a'] });
  useSelectionStore.getState().select({ kind: 'form', id: 'private-form-a' });
  let resolve!: (value: string) => void;
  const pending = client.fetchQuery({ queryKey: ['activity'], queryFn: () => new Promise<string>((done) => { resolve = done; }) }).catch(() => undefined);
  resetSessionData(client);
  resolve('private-data-a');
  await pending;
  await Promise.resolve();
  assert.equal(client.getQueryData(['offers']), undefined);
  assert.equal(client.getQueryData(['activity']), undefined);
  assert.equal(client.getMutationCache().getAll().length, 0);
  assert.equal(useSelectionStore.getState().selected, null);
});

test('auth boundary remounts local component state and invalidates stale auth completions', () => {
  const source = readFileSync(new URL('../src/lib/auth-context.tsx', import.meta.url), 'utf8');
  assert.match(source, /AuthContext\.Provider key=\{sessionEpoch\}/);
  assert.match(source, /addEventListener\('storage', syncSession\)/);
  assert.ok((source.match(/currentRevision !== revision.current/g) ?? []).length >= 4);
});

test('private preview requires bearer, no-store and preserves CSP without putting tokens in the URL', async () => {
  const originalFetch = globalThis.fetch;
  let observed: RequestInit | undefined;
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, '/v1/clones/fixture-a/preview');
      observed = options;
      return new Response('<html><p>fixture</p></html>', { headers: { 'Content-Security-Policy': "script-src 'none'; default-src 'none'" } });
    };
    await assert.rejects(loadPrivatePreview('/v1/clones/fixture-a/preview', null, new AbortController().signal), /Entre/);
    const html = await loadPrivatePreview('/v1/clones/fixture-a/preview', 'fixture-token', new AbortController().signal);
    assert.equal(observed?.cache, 'no-store');
    assert.deepEqual(observed?.headers, { Authorization: 'Bearer fixture-token', Accept: 'text/html' });
    assert.match(html, /http-equiv="Content-Security-Policy"/);
    assert.match(html, /script-src 'none'/);
    assert.doesNotMatch(html, /fixture-token/);
    globalThis.fetch = async () => new Response('private', { status: 403 });
    await assert.rejects(loadPrivatePreview('/v1/clones/fixture-b/preview', 'fixture-token', new AbortController().signal), /Não foi possível/);
  } finally { globalThis.fetch = originalFetch; }
});
