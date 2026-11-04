import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import { interpolateCount } from '../../packages/web/src/lib/motion-session.ts';

test('screen reentry replays from zero; filter changes continue from the visible value', () => {
  const require = createRequire(import.meta.url);
  const ts = require('typescript');
  const source = readFileSync(
    new URL(
      '../../packages/web/src/components/design-system/reference-motion.tsx',
      import.meta.url,
    ),
    'utf8',
  );
  const hooks = [];
  const frames = new Map();
  let cursor = 0;
  let id = 0;
  let cleanup;
  let reading = false;
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = initial;
      return [
        hooks[index],
        (value) => {
          hooks[index] = value;
        },
      ];
    },
    useRef(initial) {
      const index = cursor++;
      hooks[index] ??= { current: initial };
      return hooks[index];
    },
    useEffect(callback) {
      if (!reading) {
        cleanup?.();
        cleanup = callback();
      }
    },
  };
  const exports = {};
  const context = vm.createContext({
    exports,
    Intl,
    Math,
    window: {
      matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    },
    document: { hidden: false, addEventListener() {}, removeEventListener() {} },
    requestAnimationFrame(callback) {
      frames.set(++id, callback);
      return id;
    },
    cancelAnimationFrame(value) {
      frames.delete(value);
    },
    require(name) {
      if (name === 'react') return react;
      if (name === '@/lib/motion-session') return { interpolateCount };
      if (
        [
          'react/jsx-runtime',
          'lucide-react',
          '@/components/ui/button',
          './reference.module.css',
        ].includes(name)
      )
        return {};
      throw new Error(name);
    },
  });
  vm.runInContext(
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText,
    context,
  );
  let target = 1000;
  let replay = 0;
  let enabled = true;
  function render(read = false) {
    cursor = 0;
    reading = read;
    return exports.useReferenceNumber(target, enabled, false, replay);
  }
  function tick(time) {
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending) callback(time);
  }
  render();
  tick(0);
  tick(800);
  const visible = render(true);
  assert.ok(visible > 0 && visible < 1000);
  target = 2000;
  render();
  assert.equal(render(true), visible);
  tick(1000);
  tick(1800);
  assert.ok(render(true) > visible && render(true) < 2000);
  tick(3000);
  assert.equal(render(true), 2000);
  target = 1000;
  replay++;
  render();
  assert.equal(render(true), 0);
  tick(4000);
  tick(6000);
  assert.equal(render(true), 1000);
  target = 500;
  render();
  assert.equal(render(true), 1000);
  tick(7000);
  tick(7800);
  assert.ok(render(true) > 500 && render(true) < 1000);
  replay++;
  render();
  assert.equal(render(true), 0);
  enabled = false;
  render();
  assert.equal(render(true), 500);
  assert.equal(frames.size, 0);
  cleanup?.();
});
