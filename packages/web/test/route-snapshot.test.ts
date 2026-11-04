import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  prepareRouteTransition,
  registerRouteCapture,
  routeSnapshotBounds,
} from '../src/lib/route-snapshot';

test('links, commands and history share capture; filters and external links do not', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: {
        href: 'http://localhost:3120/ofertas',
        origin: 'http://localhost:3120',
        pathname: '/ofertas',
      },
    },
  });
  let captured = 0;
  const unregister = registerRouteCapture(() => {
    captured++;
  });
  try {
    prepareRouteTransition('/ofertas?from=2026-11-01');
    prepareRouteTransition('https://example.com/');
    prepareRouteTransition('http://[');
    assert.equal(captured, 0);
    prepareRouteTransition('/');
    prepareRouteTransition();
    assert.equal(captured, 2);
    prepareRouteTransition('/ofertas?view=people');
    assert.equal(captured, 3);
    unregister();
    prepareRouteTransition('/tarefas');
    assert.equal(captured, 3);
  } finally {
    unregister();
    if (descriptor) Object.defineProperty(globalThis, 'window', descriptor);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});

test('outgoing content never covers the fixed header, including a scrolled page', () => {
  const viewport = { top: 88, left: 108, right: 1280, bottom: 720 };
  assert.deepEqual(
    routeSnapshotBounds({ top: -400, left: 124, right: 1260, bottom: 1500 }, viewport, 1280, 720),
    { top: 88, left: 124, width: 1136, height: 632 },
  );
  assert.equal(
    routeSnapshotBounds({ top: 900, left: 124, right: 1260, bottom: 1500 }, viewport, 1280, 720)
      .height,
    0,
  );
});

test('public surfaces clip to the viewport on narrow screens too', () => {
  const box = { top: -10, left: -20, right: 500, bottom: 1000 };
  assert.deepEqual(routeSnapshotBounds(box, box, 390, 844), {
    top: 0,
    left: 0,
    width: 390,
    height: 844,
  });
});

test('visual copies cannot retain credentials, run embedded documents or cross sessions', () => {
  const source = readFileSync(new URL('../src/lib/route-snapshot.ts', import.meta.url), 'utf8');
  assert.match(source, /snapshot\.generation !== generation/);
  assert.match(source, /frame\.inert = true/);
  assert.match(source, /setAttribute\('aria-hidden', 'true'\)/);
  assert.match(source, /node\.value = ''/);
  assert.match(source, /script, iframe, object, embed/);
  assert.match(source, /attributeFilter: \['data-tmx-privacy', 'data-tmx-motion'\]/);
  const session = readFileSync(new URL('../src/lib/session-data.ts', import.meta.url), 'utf8');
  assert.match(session, /clearRouteSnapshot\(\)/);
});
