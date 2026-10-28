import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

// Minimal transaction fixture exercises the real worker without sending network traffic.
function fixture(windows = []) {
  const records = new Map();
  const handlers = new Map();
  const notifications = [];
  const db = {
    close() {},
    transaction() {
      const tx = {};
      let pending = 0;
      const schedule = (fn) => {
        pending++;
        queueMicrotask(() => {
          fn();
          if (!--pending) queueMicrotask(() => tx.oncomplete?.());
        });
      };
      tx.objectStore = () => ({
        get(key) {
          const request = {};
          schedule(() => {
            request.result = records.get(key);
            request.onsuccess?.();
          });
          return request;
        },
        put(value, key) {
          records.set(key, value);
          schedule(() => {});
        },
        openCursor() {
          const request = {};
          schedule(() => {
            request.result = null;
            request.onsuccess?.();
          });
          return request;
        },
      });
      return tx;
    },
  };
  const indexedDB = {
    open() {
      const request = {};
      queueMicrotask(() => {
        request.result = db;
        request.onsuccess?.();
      });
      return request;
    },
  };
  const self = {
    location: { origin: 'https://example.com' },
    skipWaiting() {},
    addEventListener(type, handler) {
      handlers.set(type, handler);
    },
    clients: {
      claim() {},
      async matchAll() {
        return windows;
      },
      async openWindow() {},
    },
    registration: {
      async getNotifications() {
        return [];
      },
      async showNotification(title, options) {
        notifications.push({ title, options });
      },
    },
  };
  return { records, handlers, notifications, indexedDB, self };
}
async function load(windows) {
  const f = fixture(windows);
  vm.runInNewContext(await readFile(new URL('../public/tmx-push-sw.js', import.meta.url), 'utf8'), {
    self: f.self,
    indexedDB: f.indexedDB,
    URL,
    Date,
    Promise,
  });
  return f;
}
async function push(f, data) {
  let result;
  f.handlers.get('push')({
    data: { json: () => data },
    waitUntil(work) {
      result = work;
    },
  });
  await result;
}
test('outside TMX shows one generic notification, dedupes retries and rejects another account', async () => {
  const f = await load([]);
  f.records.set('session', 'member');
  const message = { id: 'order', userId: 'member', createdAt: new Date().toISOString() };
  await push(f, message);
  await push(f, message);
  await push(f, { ...message, id: 'private', userId: 'other' });
  assert.equal(f.notifications.length, 1);
  assert.equal(f.notifications[0].options.body, 'Abra o TMX para ver os detalhes.');
  assert.equal(f.notifications[0].options.tag, 'tmx-sale:order');
});
test('does not duplicate the in-page popup or show expired/disabled notifications', async () => {
  const f = await load([{ focused: true, visibilityState: 'visible' }]);
  f.records.set('session', 'member');
  await push(f, { id: 'focused', userId: 'member', createdAt: new Date().toISOString() });
  await push(f, {
    id: 'old',
    userId: 'member',
    createdAt: new Date(Date.now() - 180000).toISOString(),
  });
  f.records.set('session', null);
  await push(f, { id: 'logout', userId: 'member', createdAt: new Date().toISOString() });
  assert.equal(f.notifications.length, 0);
});

test('logout disables the device and cross-origin messages cannot re-enable it', async () => {
  const f = await load([]);
  f.records.set('session', 'member');
  const acknowledgements = [];
  let work;
  f.handlers.get('message')({
    data: { type: 'TMX_PUSH_SESSION', userId: null },
    source: { url: 'https://example.com/' },
    ports: [{ postMessage: (value) => acknowledgements.push(value) }],
    waitUntil: (promise) => {
      work = promise;
    },
  });
  await work;
  assert.equal(f.records.get('session'), null);
  assert.equal(acknowledgements[0].ok, true);
  f.handlers.get('message')({
    data: { type: 'TMX_PUSH_SESSION', userId: 'attacker' },
    source: { url: 'https://evil.example/' },
    ports: [],
    waitUntil: () => assert.fail('cross-origin message accepted'),
  });
  assert.equal(f.records.get('session'), null);
});
