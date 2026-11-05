import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

test('country map pauses offscreen and in hidden tabs, retaining manual pause and cleanup', () => {
  const ts = createRequire(import.meta.url)('typescript');
  const source = readFileSync(
    new URL('../src/components/overview/country-activity-map.tsx', import.meta.url),
    'utf8',
  );
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  let rect = { top: 1000, bottom: 1400, left: 0, right: 900 };
  let pending = false;
  let stateCursor = 0;
  let refCursor = 0;
  let effects;
  const states = [];
  const refs = [];
  const observers = [];
  const listeners = new Map();
  const panel = { getBoundingClientRect: () => rect };
  const document = {
    hidden: false,
    addEventListener: (name, callback) => listeners.set(name, callback),
    removeEventListener: (name, callback) => {
      assert.equal(listeners.get(name), callback);
      listeners.delete(name);
    },
  };
  const node = (type, props) => {
    if (type === 'section' && props.ref) props.ref.current = panel;
    return { type, props };
  };
  const exports = {};
  vm.runInNewContext(`${code}\nexports.Activity = Activity;`, {
    exports,
    document,
    window: { innerHeight: 720, innerWidth: 1280 },
    IntersectionObserver: class {
      constructor(callback) {
        this.callback = callback;
        observers.push(this);
      }
      observe(target) {
        assert.equal(target, panel);
      }
      disconnect() {
        this.disconnected = true;
      }
    },
    require(name) {
      if (name === 'react/jsx-runtime') return { jsx: node, jsxs: node };
      if (name === 'react')
        return {
          useState(initial) {
            const index = stateCursor++;
            if (!(index in states)) states[index] = initial;
            return [
              states[index],
              (value) => {
                states[index] = value;
              },
            ];
          },
          useRef(initial) {
            const index = refCursor++;
            refs[index] ??= { current: initial };
            return refs[index];
          },
          useEffect: (callback) => effects.push(callback),
          useMemo: () => ({ countries: [], grid: '' }),
        };
      if (name.endsWith('data-pending')) return { useDataPending: () => pending };
      if (name === '@tanstack/react-query') return { useQueries: () => [] };
      if (name === 'i18n-iso-countries') return { default: { registerLocale() {} } };
      if (name.endsWith('.css')) return { default: {} };
      return {};
    },
  });
  const render = (animated = true) => {
    stateCursor = 0;
    refCursor = 0;
    effects = [];
    return exports.Activity({
      offerIds: [],
      period: {},
      animated,
      scope: 'one',
      salesView: 'general',
    });
  };
  const paused = () => render().props['data-paused'];
  assert.equal(paused(), true);
  const cleanup = effects[0]();
  assert.equal(paused(), true, 'initial bounds pause an already offscreen panel');
  assert.equal(observers.length, 1);
  const observer = observers[0];
  rect = { top: 100, bottom: 500, left: 0, right: 900 };
  observer.callback([{ isIntersecting: true }]);
  assert.equal(paused(), false);
  document.hidden = true;
  listeners.get('visibilitychange')();
  assert.equal(paused(), true);
  document.hidden = false;
  listeners.get('visibilitychange')();
  assert.equal(paused(), false);
  observer.callback([{ isIntersecting: false }]);
  assert.equal(paused(), true);
  observer.callback([{ isIntersecting: true }]);
  const button = render().props.children[0].props.children[1].props.children[1];
  button.props.onClick();
  assert.equal(paused(), true, 'returning to view must preserve manual pause');
  observer.callback([{ isIntersecting: false }]);
  observer.callback([{ isIntersecting: true }]);
  assert.equal(paused(), true);
  render().props.children[0].props.children[1].props.children[1].props.onClick();
  pending = true;
  assert.equal(paused(), true);
  pending = false;
  assert.equal(render(false).props['data-paused'], true);
  assert.equal(paused(), false);
  assert.equal(observers.length, 1, 'data and visibility updates do not rebuild the observer');
  cleanup();
  assert.equal(observer.disconnected, true);
  assert.equal(listeners.size, 0);
});
