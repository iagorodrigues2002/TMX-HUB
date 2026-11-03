import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { AuthUser } from '../src/lib/api-client/auth-types';
import { authorizationFingerprint, subscribeAuthRefresh } from '../src/lib/auth-refresh';

const member: AuthUser = {
  id: 'member',
  role: 'user',
  name: 'Member',
  email: 'member@test',
  createdAt: '',
};

test('authorization identity detects grants and revocations without reacting to tool ordering', () => {
  const a = {
    ...member,
    allowedTools: ['logs', 'nav:operator-activity'] as AuthUser['allowedTools'],
  };
  assert.equal(
    authorizationFingerprint(a),
    authorizationFingerprint({ ...a, allowedTools: [...a.allowedTools!].reverse() }),
  );
  assert.notEqual(
    authorizationFingerprint(a),
    authorizationFingerprint({ ...member, allowedTools: ['logs'] }),
  );
  assert.notEqual(
    authorizationFingerprint(member),
    authorizationFingerprint({ ...member, allowedTools: [] }),
  );
  assert.notEqual(
    authorizationFingerprint(member),
    authorizationFingerprint({ ...member, role: 'admin' }),
  );
  const source = readFileSync(new URL('../src/lib/auth-context.tsx', import.meta.url), 'utf8');
  assert.match(source, /principal\.current !== identity\) resetSession\(\)/);
  assert.match(source, /return subscribeAuthRefresh\(refresh\)/);
});

test('refreshes visible sessions on focus and timer, avoids overlapping requests, and cleans up', async () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  let tick!: () => void;
  let cleared = false;
  Object.assign(win, {
    setInterval: (callback: () => void, ms: number) => {
      assert.equal(ms, 30_000);
      tick = callback;
      return 1;
    },
    clearInterval: (id: number) => {
      assert.equal(id, 1);
      cleared = true;
    },
  });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: win });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: doc });
  let calls = 0;
  let finish!: () => void;
  const unsubscribe = subscribeAuthRefresh(() => {
    calls += 1;
    return new Promise<void>((resolve) => {
      finish = resolve;
    });
  });
  try {
    win.dispatchEvent(new Event('focus'));
    tick();
    doc.dispatchEvent(new Event('visibilitychange'));
    assert.equal(calls, 1);
    finish();
    await new Promise<void>((resolve) => setImmediate(resolve));
    doc.visibilityState = 'hidden';
    tick();
    assert.equal(calls, 1);
    doc.visibilityState = 'visible';
    doc.dispatchEvent(new Event('visibilitychange'));
    assert.equal(calls, 2);
    finish();
    await new Promise<void>((resolve) => setImmediate(resolve));
    tick();
    assert.equal(calls, 3);
    finish();
    await new Promise<void>((resolve) => setImmediate(resolve));
    unsubscribe();
    win.dispatchEvent(new Event('focus'));
    doc.dispatchEvent(new Event('visibilitychange'));
    tick();
    assert.equal(calls, 3);
    assert.equal(cleared, true);
  } finally {
    unsubscribe();
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});
