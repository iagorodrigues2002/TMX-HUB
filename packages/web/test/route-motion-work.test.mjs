import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const ts = createRequire(import.meta.url)('typescript');

test('count-up text updates stay still; new tabs enter without stale completion callbacks', async () => {
  let queries = 0;
  const observers = [];
  const effects = [];
  const frames = [];
  const completions = [];
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
  const registeredEvents = [];
  const eventHandlers = new Map();
  const timers = new Map();
  let timerId = 0;
  const events = {
    addEventListener: (name, callback) => {
      registeredEvents.push(name);
      eventHandlers.set(name, [...(eventHandlers.get(name) ?? []), callback]);
    },
    removeEventListener() {},
  };
  const fakeDocument = { ...events, documentElement: root, hidden: false };
  vm.runInNewContext(compile('../src/components/hub/route-motion.tsx'), {
    exports,
    HTMLElement,
    document: fakeDocument,
    window: {
      ...events,
      location: { search: '', pathname: '/' },
      matchMedia: () => ({ ...events, matches: false }),
    },
    URLSearchParams,
    requestAnimationFrame: (callback) => frames.push(callback),
    cancelAnimationFrame() {},
    setTimeout: (callback) => {
      timers.set(++timerId, callback);
      return timerId;
    },
    clearTimeout: (id) => timers.delete(id),
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
      if (name.endsWith('screen-transition'))
        return {
          setRouteEntranceDelay() {},
          cancelScreenAnimations() {},
          animateScreenPanels: () => new Promise((resolve) => completions.push(resolve)),
        };
      if (name.endsWith('.module.css')) return { default: {} };
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  exports.RouteMotion({ children: null });
  const cleanups = effects.map((effect) => effect());
  assert.ok(!registeredEvents.includes('click'), 'navigation must not synchronously capture DOM');
  assert.ok(!registeredEvents.includes('popstate'), 'history must use the native Next router');
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
  frames.shift()();
  surface.dataset.motionScreen = 'next-tab';
  observers[0]([
    { type: 'attributes', target: surface, attributeName: 'data-motion-screen', addedNodes: [] },
  ]);
  frames.shift()();
  assert.equal(completions.length, 2);
  completions[0]();
  await Promise.resolve();
  assert.equal(
    surface.dataset.routeTransition,
    'entering',
    'old completions cannot finish a new tab',
  );
  completions[1]();
  await Promise.resolve();
  assert.equal(surface.dataset.routeTransition, 'entered');
  const scroll = eventHandlers.get('scroll')?.[0];
  assert.ok(scroll, 'scrolling must temporarily pause decorative CSS animations');
  scroll();
  scroll();
  assert.equal(root.dataset.tmxMotionPaused, 'true');
  assert.equal(timers.size, 1, 'a scroll burst keeps just one idle timer');
  const resume = timers.values().next().value;
  timers.clear();
  resume();
  assert.equal(root.dataset.tmxMotionPaused, 'false');
  fakeDocument.hidden = true;
  scroll();
  timers.values().next().value();
  assert.equal(root.dataset.tmxMotionPaused, 'true', 'scroll idle must not resume a hidden tab');
  for (const cleanup of cleanups.reverse()) cleanup?.();
  assert.equal(timers.size, 0, 'unmount clears the idle timer');
});
