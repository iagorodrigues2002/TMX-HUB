import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const ts = createRequire(import.meta.url)('typescript');

test('count-up text updates do not rescan the route; new panels and tabs still do', () => {
  let queries = 0;
  const observers = [];
  const effects = [];
  class HTMLElement {
    dataset = {};
    parentElement = null;
    isConnected = true;
    querySelector() {
      queries++;
      return surface;
    }
    querySelectorAll() {
      queries++;
      return [];
    }
    closest() {
      return null;
    }
    matches() {
      return false;
    }
    contains(node) {
      return node === this;
    }
    getAttribute() {
      return null;
    }
  }
  const root = new HTMLElement();
  const surface = new HTMLElement();
  const exports = {};
  const selection = {};
  const compile = (path) =>
    ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
  vm.runInNewContext(compile('../src/lib/route-motion-selection.ts'), { exports: selection });
  const events = { addEventListener() {}, removeEventListener() {} };
  vm.runInNewContext(compile('../src/components/hub/route-motion.tsx'), {
    exports,
    HTMLElement,
    document: { ...events, documentElement: root, hidden: false },
    window: {
      ...events,
      location: { search: '' },
      matchMedia: () => ({ ...events, matches: false }),
    },
    URLSearchParams,
    requestAnimationFrame: () => 1,
    cancelAnimationFrame() {},
    MutationObserver: class {
      constructor(callback) {
        observers.push(callback);
      }
      observe() {}
      disconnect() {}
    },
    require(name) {
      if (name === 'react')
        return {
          useRef: () => ({ current: root }),
          useLayoutEffect: (effect) => effects.push(effect),
        };
      if (name === 'react/jsx-runtime') return { jsx: () => null };
      if (name === 'next/navigation') return { usePathname: () => '/' };
      if (name.endsWith('interface-effects'))
        return { useInterfaceEffects: () => ({ visual: true }) };
      if (name.endsWith('session-data')) return { getSessionGeneration: () => 0 };
      if (name.endsWith('motion-session')) return { motionScreenKey: () => '/' };
      if (name.endsWith('route-motion-selection')) return selection;
      if (name.endsWith('route-snapshot'))
        return {
          playRouteSnapshot: () => false,
          registerRouteCapture: () => () => {},
          clearRouteSnapshot() {},
        };
      if (name.endsWith('screen-transition'))
        return { setRouteEntranceDelay() {}, cancelScreenAnimations() {} };
      if (name.endsWith('.module.css')) return { default: {} };
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  exports.RouteMotion({ children: null });
  for (const effect of effects) effect();
  assert.equal(observers.length, 1);
  queries = 0;
  const textOnly = { type: 'childList', addedNodes: [{}], removedNodes: [{}] };
  for (let frame = 0; frame < 120; frame++) observers[0]([textOnly]);
  assert.equal(queries, 0, 'text frames must not query route surfaces or enumerate panels');
  observers[0]([{ type: 'childList', addedNodes: [new HTMLElement()], removedNodes: [] }]);
  assert.ok(queries > 0, 'async panels must still be discovered');
  queries = 0;
  observers[0]([
    { type: 'attributes', target: surface, attributeName: 'data-motion-screen', addedNodes: [] },
  ]);
  assert.ok(queries > 0, 'screen identity changes must still be handled');
});
