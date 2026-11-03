import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  isActiveMotionTab,
  routeEntrancePanels,
  routeEntranceScreens,
} from '../src/components/hub/route-motion';
import {
  PANEL_ENTRANCE,
  ROUTE_TRANSITION,
  ROUTE_TRANSITION_FRAMES,
  claimMotionEntrance,
  interpolateCount,
  isRouteTransition,
  motionScreenKey,
  panelEntranceFrames,
  visitMotionScreen,
} from '../src/lib/motion-session';

test('route dissolve runs on navigation including revisits, never on focus or data refresh', () => {
  assert.equal(isRouteTransition(null, '/'), false);
  assert.equal(isRouteTransition('/', '/empresa/membros'), true);
  assert.equal(isRouteTransition('/empresa/membros', '/'), true);
  assert.equal(isRouteTransition('/', '/'), false);
  assert.ok(ROUTE_TRANSITION.duration <= 250);
  assert.ok(ROUTE_TRANSITION_FRAMES.every((frame) => Object.keys(frame).join() === 'opacity'));
  assert.ok(Number(ROUTE_TRANSITION_FRAMES[0].opacity) >= 0.6);
});

test('route identity survives shell remounts but never retains page data', () => {
  const session = { current: null as string | null, visited: new Set<string>() };
  assert.deepEqual(visitMotionScreen('0:/', session), { navigating: false, firstVisit: true });
  assert.deepEqual(visitMotionScreen('0:/tarefas', session), {
    navigating: true,
    firstVisit: true,
  });
  assert.deepEqual(visitMotionScreen('0:/', session), { navigating: true, firstVisit: false });
  assert.deepEqual(visitMotionScreen('0:/', session), { navigating: false, firstVisit: false });
  assert.deepEqual(visitMotionScreen('1:/', session), { navigating: true, firstVisit: true });
  assert.deepEqual([...session.visited], ['0:/', '0:/tarefas', '1:/']);
});

test('each route and tab enters once; polling filters and focus are not new screens', () => {
  const visited = new Set<string>();
  const makeKey = (query: string) => motionScreenKey('/tracking', new URLSearchParams(query));
  assert.equal(claimMotionEntrance(makeKey('view=overview&offer=one'), visited), true);
  assert.equal(
    claimMotionEntrance(makeKey('view=overview&offer=two&from=2026-11-01'), visited),
    false,
  );
  assert.equal(claimMotionEntrance(makeKey('view=upsell'), visited), true);
  assert.equal(claimMotionEntrance(makeKey('view=overview'), visited), false);
  assert.notEqual(makeKey('tab=members'), makeKey('tab=finance'));
});

test('entrance budget is bounded and cannot hide the page or change layout dimensions', () => {
  assert.equal(PANEL_ENTRANCE.maxPanels, 6);
  assert.ok(
    PANEL_ENTRANCE.duration + (PANEL_ENTRANCE.maxPanels - 1) * PANEL_ENTRANCE.stagger <= 750,
  );
  for (const frame of panelEntranceFrames()) {
    assert.deepEqual(Object.keys(frame).sort(), ['opacity', 'transform']);
    assert.ok(Number(frame.opacity) > 0);
  }
  assert.ok(panelEntranceFrames(true).every((frame) => frame.transform === 'none'));
});

test('panel selection excludes hidden surfaces and never animates both ancestor and child', () => {
  const makePanel = (hidden = false) => ({
    closest: () => (hidden ? {} : null),
    contains: (_other: unknown) => false,
  });
  const parent = makePanel();
  const child = makePanel();
  const hidden = makePanel(true);
  parent.contains = (other: unknown) => other === child;
  const candidates = [parent, child, hidden, ...Array.from({ length: 10 }, () => makePanel())];
  const root = { querySelectorAll: () => candidates } as unknown as HTMLElement;
  const panels = routeEntrancePanels(root);
  assert.equal(panels.length, 6);
  assert.equal(panels[0], parent);
  assert.ok(!panels.includes(child as unknown as HTMLElement));
  assert.ok(!panels.includes(hidden as unknown as HTMLElement));
});

test('a plain or loading page remains visible even without explicit panel markers', () => {
  const root = { querySelectorAll: () => [] } as unknown as HTMLElement;
  assert.deepEqual(routeEntrancePanels(root), [root]);
});

test('nested tab entrances animate only the outer active screen', () => {
  const child = { closest: () => null, contains: () => false };
  const outer = { closest: () => null, contains: (node: unknown) => node === child };
  const hidden = { closest: () => ({}), contains: () => false };
  const root = {
    matches: () => false,
    querySelectorAll: () => [outer, child, hidden],
  } as unknown as HTMLElement;
  assert.deepEqual(routeEntranceScreens(root), [outer]);
  const added = { ...outer, matches: () => true } as unknown as HTMLElement;
  assert.deepEqual(routeEntranceScreens(added), [added]);
});

test('only active tab panels can replay; reinserting a data screen after refetch cannot', () => {
  const screen = (attributes: Record<string, string>) => ({
    getAttribute: (name: string) => attributes[name] ?? null,
  });
  assert.equal(isActiveMotionTab(screen({ 'data-motion-screen': 'orders' })), false);
  assert.equal(isActiveMotionTab(screen({ 'data-state': 'active' })), false);
  assert.equal(isActiveMotionTab(screen({ role: 'tabpanel', 'data-state': 'inactive' })), false);
  assert.equal(isActiveMotionTab(screen({ role: 'tabpanel', 'data-state': 'active' })), true);
  const visited = new Set<string>();
  assert.equal(claimMotionEntrance('orders', visited), true);
  assert.equal(claimMotionEntrance('orders', visited), false);
});

test('count updates interpolate from the existing reading, converge exactly and support decreases', () => {
  assert.equal(interpolateCount(800, 900, 0), 800);
  assert.ok(interpolateCount(800, 900, 0.5) > 800);
  assert.equal(interpolateCount(800, 900, 1), 900);
  assert.equal(interpolateCount(900, 800, 1), 800);
  assert.equal(interpolateCount(900, 800, 0), 900);
  assert.equal(interpolateCount(0, 50, 2), 50);
  assert.equal(interpolateCount(0, 50, -1), 0);
  const earlyStep = interpolateCount(0, 100, 0.2) - interpolateCount(0, 100, 0.1);
  const lateStep = interpolateCount(0, 100, 0.9) - interpolateCount(0, 100, 0.8);
  assert.ok(earlyStep > lateStep * 20);
});

test('motion hooks retain explicit off, privacy, hidden-tab and reduced-motion guards', () => {
  const hook = readFileSync(new URL('../src/lib/hooks/use-count-up.ts', import.meta.url), 'utf8');
  assert.match(hook, /dataset\.tmxPrivacy !== 'on'/);
  assert.match(hook, /dataset\.tmxMotion !== 'off'/);
  assert.match(hook, /!document\.hidden/);
  assert.match(hook, /!mediaQuery\.matches/);
  assert.doesNotMatch(hook, /setDisplayValue\(0\)/);
  assert.match(hook, /value === undefined.*undefined : displayValue/);
  const route = readFileSync(
    new URL('../src/components/hub/route-motion.tsx', import.meta.url),
    'utf8',
  );
  assert.match(route, /!visual \|\| reduced\.matches \|\| document\.hidden/);
  assert.match(route, /observer\.disconnect\(\)/);
  assert.match(route, /attributeFilter: \['data-motion-screen', 'data-state', 'hidden'\]/);
  assert.doesNotMatch(route, /characterData: true|setInterval|setTimeout/);
  assert.match(route, /animation\.cancel\(\)/);
  assert.doesNotMatch(route, /addEventListener\(['"]focus/);
  assert.doesNotMatch(route, /sessionStorage|localStorage/);
});

test('refund legacy reveals defer to the shell without replaying or hiding panels', () => {
  const css = readFileSync(
    new URL('../src/components/hub/route-motion.module.css', import.meta.url),
    'utf8',
  );
  const noAnimation = css.slice(0, css.indexOf('animation: none !important;'));
  for (const name of ['refund-header', 'refund-chart-reveal', 'refund-bar-reveal']) {
    assert.ok(noAnimation.includes(`.coordinated [class~="${name}"]`));
  }
  assert.match(css, /refund-panel"\] \{\s*transition: none !important;/);
  assert.match(
    css,
    /refund-panel"\]\[data-reveal="pending"\] \{\s*opacity: 1 !important;\s*transform: none !important;/,
  );
  const hook = readFileSync(
    new URL(
      '../src/components/tracking/refunds-dashboard-use-refunds-dashboard-state.tsx',
      import.meta.url,
    ),
    'utf8',
  );
  assert.ok(
    hook.indexOf(`root.closest('[data-motion-coordinated="true"]')`) <
      hook.indexOf('new IntersectionObserver'),
  );
  // Disclosure feedback remains interactive, not disabled globally with page entrances.
  assert.doesNotMatch(css, /details\[open\]/);
});
