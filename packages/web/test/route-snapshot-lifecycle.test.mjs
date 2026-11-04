import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  captureRouteSnapshot,
  clearRouteSnapshot,
  playRouteSnapshot,
} from '../src/lib/route-snapshot.ts';

test('StrictMode keeps one outgoing visual through effect rehearsal and session changes purge it', () => {
  const descriptors = new Map();
  const install = (key, value) => {
    descriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, value });
  };
  const box = { top: 88, left: 108, right: 1280, bottom: 720, width: 1172, height: 632 };
  let removed = 0;
  const element = () => ({
    style: {},
    dataset: {},
    children: [],
    setAttribute() {},
    removeAttribute() {},
    remove() {
      removed++;
    },
    getBoundingClientRect: () => box,
    animate: () => ({ finished: Promise.resolve(), cancel() {} }),
    append(child) {
      this.children.push(child);
      child.parentElement = this;
    },
  });
  const body = element();
  const copy = element();
  const material = element();
  const content = element();
  copy.children = [material, content];
  copy.querySelector = () => material;
  copy.querySelectorAll = () => [];
  copy.matches = () => true;
  const root = { ...element(), closest: () => body, cloneNode: () => copy };
  install('document', { body, documentElement: {}, createElement: element });
  install('innerWidth', 1280);
  install('innerHeight', 720);
  install('HTMLInputElement', class {});
  install('HTMLTextAreaElement', class {});
  install(
    'MutationObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  install('getComputedStyle', () => ({ position: 'relative' }));
  try {
    captureRouteSnapshot(root, [root], '0:/ofertas', 0);
    assert.equal(playRouteSnapshot('0:/', 0, null), true);
    assert.equal(body.children.length, 1);
    assert.equal(playRouteSnapshot('0:/', 0, null), true);
    assert.equal(body.children.length, 1);
    assert.equal(removed, 0);
    clearRouteSnapshot();
    assert.equal(removed, 1);
    assert.equal(playRouteSnapshot('0:/', 0, null), false);
    captureRouteSnapshot(root, [root], '0:/ofertas', 0);
    assert.equal(playRouteSnapshot('1:/', 1, null), false);
  } finally {
    clearRouteSnapshot();
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
