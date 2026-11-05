import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import { interpolateCount } from '../src/lib/motion-session';

const ts = createRequire(import.meta.url)('typescript');
const code = ts.transpileModule(
  readFileSync(new URL('../src/lib/hooks/use-count-up.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText;

for (const hz of [60, 120, 144, 165, 200]) {
  test(`count-up uses elapsed time at ${hz}Hz, including interruption and decreasing values`, () => {
    const refs = [];
    let cursor = 0;
    let display;
    let effect;
    let cleanup;
    let nextFrame = 0;
    const callbacks = new Map();
    const exports = {};
    const events = { addEventListener() {}, removeEventListener() {} };
    vm.runInNewContext(code, {
      exports,
      window: { matchMedia: () => ({ ...events, matches: false }) },
      document: { ...events, hidden: false, documentElement: { dataset: {} } },
      MutationObserver: class {
        observe() {}
        disconnect() {}
      },
      requestAnimationFrame: (callback) => {
        callbacks.set(++nextFrame, callback);
        return nextFrame;
      },
      cancelAnimationFrame: (id) => callbacks.delete(id),
      require(name) {
        if (name === 'react')
          return {
            useState: (value) => [
              display ?? value,
              (next) => {
                display = next;
              },
            ],
            useRef: (value) => {
              const index = cursor++;
              refs[index] ??= { current: value };
              return refs[index];
            },
            useLayoutEffect: (callback) => {
              effect = callback;
            },
          };
        if (name.endsWith('data-pending')) return { useDataPending: () => false };
        if (name.endsWith('motion-session')) return { interpolateCount };
        if (name.endsWith('screen-transition')) return { routeEntranceReadyAt: () => 0 };
        throw Error(`Unexpected dependency: ${name}`);
      },
    });
    const render = (value) => {
      cleanup?.();
      cursor = 0;
      exports.useCountUp(value, 1000, 'same-metric');
      cleanup = effect();
    };
    const step = (timestamp) => {
      const batch = [...callbacks.values()];
      callbacks.clear();
      for (const callback of batch) callback(timestamp);
    };
    try {
      render(100);
      step(0);
      for (let frame = 1; frame <= Math.floor(hz / 2); frame++) step((frame * 1000) / hz);
      const progress = Math.floor(hz / 2) / hz;
      assert.equal(display, interpolateCount(0, 100, progress));
      const interrupted = display;
      render(20);
      assert.equal(display, interrupted, 'a filter change must start from the visible reading');
      step(0);
      for (let frame = 1; frame <= hz; frame++) step((frame * 1000) / hz);
      assert.equal(display, 20);
      assert.equal(callbacks.size, 0, 'the animation stops at its target at every frequency');
      render(200);
      step(0);
      for (let frame = 1; frame <= hz; frame++) step((frame * 1000) / hz);
      assert.equal(display, 200);
      assert.equal(callbacks.size, 0);
    } finally {
      cleanup?.();
    }
  });
}
