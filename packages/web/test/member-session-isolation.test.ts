import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { Form, Link } from '@page-cloner/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useUpdateForm } from '../src/hooks/use-update-form';
import { useUpdateLink } from '../src/hooks/use-update-link';
import { apiClient } from '../src/lib/api-client';
import {
  readPersonalStorage,
  setPersonalStorageOwner,
  writePersonalStorage,
} from '../src/lib/personal-storage';
import { loadPrivatePreview } from '../src/lib/private-preview';
import { useSelectionStore } from '../src/lib/selection-store';
import { resetSessionData } from '../src/lib/session-data';
import { listPresets } from '../src/lib/upsell/storage';
import { listHistory, pushHistory } from '../src/lib/webhook/storage';

test('personal browser records never fall back to a previous member or legacy unowned data', () => {
  const records = new Map<string, string>();
  const storage = {
    getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, value: string) => records.set(key, value),
    removeItem: (key: string) => records.delete(key),
  };
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { localStorage: storage, sessionStorage: storage },
  });
  try {
    records.set('tmx-hub:webhook-history:v1', '[{"url":"https://legacy.example"}]');
    records.set('tmx-hub:upsell-presets:v1', '[{"name":"legacy-private"}]');
    setPersonalStorageOwner('member-a');
    assert.deepEqual(listHistory(), []);
    assert.deepEqual(listPresets(), []);
    pushHistory({
      templateId: null,
      url: 'https://a.example/private',
      status: 200,
      ok: true,
      durationMs: 1,
    });
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
  const pending = client
    .fetchQuery({
      queryKey: ['activity'],
      queryFn: () =>
        new Promise<string>((done) => {
          resolve = done;
        }),
    })
    .catch(() => undefined);
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

function renderHook<T>(client: QueryClient, useHook: () => T): T {
  let result!: T;
  function Probe() {
    result = useHook();
    return null;
  }
  renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(Probe)));
  return result;
}

const form: Form = {
  id: 'dummy-form',
  selector: 'form',
  originalAction: '/original',
  currentAction: '/original',
  method: 'POST',
  mode: 'keep',
  redirectTo: 'https://fixture.invalid/after',
  fields: [],
};
const link: Link = {
  id: 'dummy-link',
  selector: 'a',
  originalHref: '/original',
  currentHref: '/original',
  text: 'Fixture',
  isExternal: false,
  isCta: false,
};
const editors = [
  {
    key: ['clone', 'dummy-clone', 'forms'],
    method: 'updateForm',
    previous: form,
    optimistic: { ...form, mode: 'disable' },
    updated: { ...form, mode: 'disable', currentAction: '/saved' },
    args: ['dummy-clone', form.id, { mode: 'disable' }],
    useSubmit: () => {
      const mutation = useUpdateForm('dummy-clone');
      return () => mutation.mutateAsync({ formId: form.id, body: { mode: 'disable' } });
    },
  },
  {
    key: ['clone', 'dummy-clone', 'links'],
    method: 'updateLink',
    previous: link,
    optimistic: { ...link, currentHref: '/edited' },
    updated: { ...link, currentHref: '/saved' },
    args: ['dummy-clone', link.id, { currentHref: '/edited' }],
    useSubmit: () => {
      const mutation = useUpdateLink('dummy-clone');
      return () => mutation.mutateAsync({ linkId: link.id, body: { currentHref: '/edited' } });
    },
  },
] as const;

for (const editor of editors) {
  for (const outcome of ['success', 'failure'] as const) {
    for (const sessionChanged of [false, true]) {
      test(`${editor.method}: ${outcome} ${sessionChanged ? 'cannot overwrite the next session' : 'settles the current session'}`, async (t) => {
        const client = new QueryClient();
        t.after(() => client.clear());
        const submit = renderHook<() => Promise<Form | Link>>(client, editor.useSubmit);
        let resolve!: (value: Form | Link) => void;
        let reject!: (error: Error) => void;
        const response = new Promise<Form | Link>((done, fail) => {
          resolve = done;
          reject = fail;
        });
        const request = t.mock.method(apiClient, editor.method, () => response);
        client.setQueryData(editor.key, [editor.previous]);
        const pending = submit();
        await new Promise<void>((resolve) => setImmediate(resolve));
        assert.equal(request.mock.calls.length, 1);
        assert.deepEqual(request.mock.calls[0]?.arguments, editor.args);
        assert.deepEqual(client.getQueryData(editor.key), [editor.optimistic]);
        const nextSession = [{ ...editor.previous, selector: 'next-session-private' }];
        if (sessionChanged) {
          resetSessionData(client);
          client.setQueryData(editor.key, nextSession);
        }
        if (outcome === 'failure') {
          reject(new Error('dummy failure'));
          await assert.rejects(pending, /dummy failure/);
        } else {
          resolve(editor.updated);
          await pending;
        }
        assert.deepEqual(
          client.getQueryData(editor.key),
          sessionChanged ? nextSession : [outcome === 'success' ? editor.updated : editor.previous],
        );
      });
    }
  }

  for (const timing of ['before mutation', 'while cancelling queries']) {
    test(`${editor.method}: session change ${timing} prevents the request and optimistic write`, async (t) => {
      const client = new QueryClient();
      t.after(() => client.clear());
      const submit = renderHook<() => Promise<Form | Link>>(client, editor.useSubmit);
      const request = t.mock.method(apiClient, editor.method, async () => editor.updated);
      let resume!: () => void;
      const cancellation = new Promise<void>((resolve) => {
        resume = resolve;
      });
      const cancel = t.mock.method(client, 'cancelQueries', () => cancellation);
      let pending: Promise<Form | Link>;
      if (timing === 'while cancelling queries') {
        pending = submit();
        assert.equal(cancel.mock.calls.length, 1);
      }
      resetSessionData(client);
      const nextSession = [{ ...editor.previous, selector: 'next-session-private' }];
      client.setQueryData(editor.key, nextSession);
      if (timing === 'before mutation') pending = submit();
      resume();
      await assert.rejects(pending!, /Sessão alterada/);
      assert.equal(request.mock.calls.length, 0);
      assert.deepEqual(client.getQueryData(editor.key), nextSession);
    });
  }
}

test('private preview requires bearer, no-store and preserves CSP without putting tokens in the URL', async () => {
  const originalFetch = globalThis.fetch;
  let observed: RequestInit | undefined;
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, '/v1/clones/fixture-a/preview');
      observed = options;
      return new Response('<html><p>fixture</p></html>', {
        headers: { 'Content-Security-Policy': "script-src 'none'; default-src 'none'" },
      });
    };
    await assert.rejects(
      loadPrivatePreview('/v1/clones/fixture-a/preview', null, new AbortController().signal),
      /Entre/,
    );
    const html = await loadPrivatePreview(
      '/v1/clones/fixture-a/preview',
      'fixture-token',
      new AbortController().signal,
    );
    assert.equal(observed?.cache, 'no-store');
    assert.deepEqual(observed?.headers, {
      Authorization: 'Bearer fixture-token',
      Accept: 'text/html',
    });
    assert.match(html, /http-equiv="Content-Security-Policy"/);
    assert.match(html, /script-src 'none'/);
    assert.doesNotMatch(html, /fixture-token/);
    globalThis.fetch = async () => new Response('private', { status: 403 });
    await assert.rejects(
      loadPrivatePreview(
        '/v1/clones/fixture-b/preview',
        'fixture-token',
        new AbortController().signal,
      ),
      /Não foi possível/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
