import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PANEL_ENTRANCE, interpolateCount, motionScreenKey } from '../src/lib/motion-session';
import {
  isActiveMotionTab,
  routeAddedPanels,
  routeEntrancePanels,
  routeEntranceScreens,
} from '../src/lib/route-motion-selection';

test('screen identity changes on navigation and tabs, but not on data filters', () => {
  const key = (query: string) => motionScreenKey('/tracking', new URLSearchParams(query));
  assert.equal(key('view=overview&offer=one'), key('view=overview&offer=two&from=2026-11-01'));
  assert.notEqual(key('view=overview'), key('view=upsell'));
  assert.notEqual(key('tab=members'), key('tab=finance'));
  assert.equal(PANEL_ENTRANCE.duration, 220);
  assert.equal(PANEL_ENTRANCE.stagger, 16);
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
  assert.equal(panels.length, 11);
  assert.equal(panels[0], parent);
  assert.ok(!panels.includes(child as unknown as HTMLElement));
  assert.ok(!panels.includes(hidden as unknown as HTMLElement));
});

test('a plain or loading page remains visible even without explicit panel markers', () => {
  const root = { querySelectorAll: () => [] } as unknown as HTMLElement;
  assert.deepEqual(routeEntrancePanels(root), [root]);
});

test('a layout section never replaces individual material cards in the camera animation', () => {
  const panel = () => ({ closest: () => null, contains: () => false });
  const header = panel();
  const metric = panel();
  const map = panel();
  const root = {
    querySelectorAll: (selector: string) =>
      selector === '[data-motion-panel]'
        ? [header, map]
        : selector.includes('.glass-card')
          ? [header, metric]
          : selector === 'section'
            ? [root]
            : [],
  } as unknown as HTMLElement;
  assert.deepEqual(routeEntrancePanels(root), [header, map, metric]);
});

test('tool headers and trailing copy join the transition without selecting text inside cards twice', () => {
  const panel = () => ({ closest: () => null, contains: (_node: unknown) => false });
  const header = panel();
  const form = panel();
  const nestedHeader = panel();
  const footer = panel();
  form.contains = (node) => node === nestedHeader;
  const root = {
    querySelectorAll: (selector: string) =>
      selector.includes('.glass-card')
        ? [form]
        : selector === 'header, footer, header ~ p'
          ? [header, nestedHeader, footer]
          : [],
  } as unknown as HTMLElement;
  assert.deepEqual(routeEntrancePanels(root), [form, header, footer]);
});

test('cards arriving after the API response enter once; metric text updates and scheduled panels do not replay', () => {
  const metric = { closest: () => null, contains: () => false } as unknown as HTMLElement;
  const root = {
    querySelectorAll: () => [metric],
    contains: (node: HTMLElement) => node === metric,
  } as unknown as HTMLElement;
  const seen = new WeakSet<HTMLElement>();
  assert.deepEqual(routeAddedPanels(root, [metric], seen, []), [metric]);
  assert.deepEqual(routeAddedPanels(root, [metric], seen, [root]), []);
  const text = { contains: () => false } as unknown as HTMLElement;
  assert.deepEqual(routeAddedPanels(root, [text], seen, []), []);
  seen.add(metric);
  assert.deepEqual(routeAddedPanels(root, [metric], seen, []), []);
  const pendingMetric = {
    ...metric,
    closest: (selector: string) => (selector.includes('data-overview-loading') ? {} : null),
  } as unknown as HTMLElement;
  const pendingRoot = { querySelectorAll: () => [pendingMetric] } as unknown as HTMLElement;
  assert.deepEqual(routeAddedPanels(pendingRoot, [pendingMetric], new WeakSet(), []), []);
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
  assert.match(route, /!visual\s*\|\|\s*reduced\.matches\s*\|\|\s*document\.hidden/);
  assert.match(route, /observer\.disconnect\(\)/);
  assert.match(route, /attributeFilter: \['data-motion-screen', 'data-state', 'hidden'\]/);
  assert.doesNotMatch(route, /characterData: true|setInterval/);
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

test('admin tab motion owns only the body; finance includes its ledger and reserve states', () => {
  const admin = readFileSync(
    new URL('../src/components/admin/admin-dashboard.tsx', import.meta.url),
    'utf8',
  );
  const bodyStart = admin.indexOf('data-motion-coordinated="true"');
  assert.ok(bodyStart > admin.indexOf('</nav>'));
  assert.ok(!admin.slice(0, bodyStart).includes('data-motion-screen'));
  assert.ok(admin.slice(bodyStart).includes('data-motion-screen={`admin:${activeView}`}'));
  const route = readFileSync(
    new URL('../src/components/hub/route-motion.tsx', import.meta.url),
    'utf8',
  );
  assert.ok(
    route.indexOf('[data-motion-coordinated="true"][data-motion-screen]') <
      route.indexOf('\'[data-motion-coordinated="true"]\''),
  );
  const finance = readFileSync(
    new URL('../src/components/overview/finance-dashboard-preview.tsx', import.meta.url),
    'utf8',
  );
  assert.match(finance, /const panel = 'glass-card /);
  assert.match(
    finance,
    /\['Movimentações', 'Saques', 'Despesas'\][\s\S]*?<section className=\{`\$\{panel\}/,
  );
  const reserve = readFileSync(
    new URL('../src/components/overview/finance-reserve.tsx', import.meta.url),
    'utf8',
  );
  const result = reserve.slice(reserve.indexOf('<div data-motion-panel>'));
  assert.match(
    result,
    /offers\.isError[\s\S]*offers\.isPending[\s\S]*!selected\.length[\s\S]*ReserveReleaseProjection/,
  );
});
