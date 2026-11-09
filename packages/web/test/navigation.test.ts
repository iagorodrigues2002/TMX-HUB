import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { NAV_ITEMS, flattenNavItems } from '../src/components/hub/nav-config';
import {
  canonicalNavigationLocation,
  navigationDestinations,
  navigationHref,
  resolveNavigation,
  visibleNavigation,
} from '../src/components/hub/navigation';
import type { AuthUser } from '../src/lib/api-client/auth-types';

const admin: AuthUser = {
  id: 'admin-synthetic',
  name: 'Admin de teste',
  email: 'admin@example.test',
  role: 'admin',
  createdAt: '2026-11-02T00:00:00Z',
};
const user: AuthUser = { ...admin, id: 'user-synthetic', role: 'user' };
const tree = visibleNavigation(admin, NAV_ITEMS, { syntheticPreview: false });
const active = (href: string) => {
  const [path = '', query = ''] = href.split('?');
  return resolveNavigation(path, query, tree);
};

test('traffic is available in production and each traffic tab selects its own navigation leaf', () => {
  assert.equal(
    tree.some((item) => item.id === 'traffic-preview'),
    true,
  );
  const preview = visibleNavigation(admin, NAV_ITEMS, { syntheticPreview: true });
  for (const [query, id] of [
    ['', 'traffic-overview'],
    ['view=overview', 'traffic-overview'],
    ['view=campaigns', 'traffic-campaigns'],
    ['view=contingency', 'traffic-contingency'],
    ['view=windows', 'traffic-windows'],
    ['view=settings', 'traffic-settings'],
  ]) {
    const item = resolveNavigation('/trafego', query!, preview);
    assert.equal(item?.item.id, id);
    assert.equal(item?.root.id, 'traffic-preview');
  }
});

test('company management capability enables tasks without granting platform administration', () => {
  const items = navigationDestinations(
    visibleNavigation(user, NAV_ITEMS, { canManageTasks: true }),
  );
  assert.ok(items.some((item) => item.id === 'task-management'));
  assert.ok(!items.some((item) => item.id.startsWith('admin-')));
  for (const canManageTasks of [false, undefined]) {
    assert.ok(
      !navigationDestinations(visibleNavigation(user, NAV_ITEMS, { canManageTasks })).some(
        (item) => item.id === 'task-management',
      ),
    );
  }
  const restricted = {
    ...user,
    allowedTools: ['nav:scoped', 'nav:offers-all'] as AuthUser['allowedTools'],
  };
  assert.ok(
    !navigationDestinations(
      visibleNavigation(restricted, NAV_ITEMS, { canManageTasks: true }),
    ).some((item) => item.id === 'task-management'),
  );
});

test('direct task navigation checks the same server capability and fails closed on errors', () => {
  const gate = readFileSync(
    new URL('../src/components/hub/navigation-access-gate.tsx', import.meta.url),
    'utf8',
  );
  const hook = readFileSync(
    new URL('../src/lib/hooks/use-task-management-access.ts', import.meta.url),
    'utf8',
  );
  assert.match(gate, /item\.requiresTaskManagement && !canManageTasks/);
  assert.match(hook, /queryKey: \['task-management-access', user\?\.id\]/);
  assert.match(hook, /queryFn: taskApi\.access/);
  assert.match(hook, /!access\.isError/);
  assert.match(hook, /refetchInterval: 60_000/);
  assert.match(
    gate,
    /item\.id === 'operator-activity' && !user\?\.allowedTools\?\.includes\('nav:operator-activity'\)/,
  );
});

test('each visible destination resolves to one canonical leaf, never to an expander', () => {
  const destinations = navigationDestinations(tree);
  assert.equal(new Set(destinations.map((item) => item.href)).size, destinations.length);
  for (const item of destinations) {
    const location = active(item.href);
    assert.equal(location?.item.id, item.id, item.href);
    assert.equal(location?.item.children?.length ?? 0, 0);
  }
  assert.equal(
    destinations.some((item) => item.href === '/settings'),
    false,
  );
  assert.equal(
    destinations.some((item) => item.href.includes('/preview/')),
    false,
  );
});

test('tracking and integrations select only their actual group and defaults are canonical', () => {
  assert.equal(active('/tracking')?.item.id, 'tracking-overview');
  assert.equal(active('/tracking?offer=qa&view=overview')?.item.label, 'Resumo da oferta');
  assert.equal(active('/tracking?view=destinations')?.item.id, 'integration-meta');
  assert.equal(active('/tracking?view=destinations&section=meta')?.root.id, 'integrations');
  assert.equal(active('/tracking?view=destinations&section=utmify')?.item.id, 'integration-utmify');
  assert.equal(active('/tracking?view=finance&section=payments')?.root.id, 'integrations');
  assert.equal(active('/tracking?view=finance&section=fees')?.item.id, 'integration-payments');
  assert.equal(active('/tracking?view=finance&section=health')?.root.id, 'tracking');
  assert.equal(active('/tracking?view=finance&section=console')?.item.id, 'tracking-diagnostics');
  assert.equal(active('/tracking?view=finance&section=help')?.item.id, 'tracking-diagnostics');
  assert.equal(active('/tracking?view=journey&section=funnel')?.item.id, 'tracking-journey');
  assert.equal(active('/tracking?view=capture&section=domains')?.item.id, 'tracking-capture');
});

test('global administration does not select overview together with another tab', () => {
  for (const [view, id] of [
    ['overview', 'admin-overview'],
    ['people', 'admin-people'],
    ['invites', 'admin-invites'],
    ['activity', 'admin-activity'],
  ])
    assert.equal(active(`/admin?view=${view}`)?.item.id, id);
  assert.equal(active('/admin')?.item.id, 'admin-overview');
  assert.equal(active('/logs')?.item.id, 'operator-activity');
  assert.equal(active('/logs')?.root.id, 'company');
  assert.equal(active('/tarefas?tab=calls')?.root.id, 'company');
  assert.equal(active('/reembolsos')?.item.label, 'Reembolsos e Chargeback');
});

test('published tracking aliases and legacy tool links retain a canonical destination', () => {
  for (const [legacy, canonical] of [
    [
      '/tracking?view=destinations&section=tiktok',
      '/tracking?view=destinations&section=tiktok-ads',
    ],
    ['/tracking?view=journey&section=upsells', '/tracking?view=upsell-intelligence'],
    ['/tracking?view=diagnostics', '/tracking?view=finance&section=health'],
    ['/tracking?view=destinations&section=payments', '/tracking?view=finance&section=payments'],
    ['/tools/creative-studio', '/tools/video-shield'],
    ['/tools/page-diff', '/tools'],
    ['/tools/cloaker-urls', '/tools'],
    ['/tools/digi-approval/old-job', '/tools'],
    ['/help/tracking-vendepay', '/tracking'],
  ])
    assert.equal(active(legacy)?.item.id, active(canonical)?.item.id, legacy);
  const location = canonicalNavigationLocation(
    '/tracking',
    'view=diagnostics&section=console&offer=qa',
  );
  assert.equal(location.params.get('offer'), 'qa');
  assert.equal(location.params.get('view'), 'finance');
  assert.equal(location.params.get('section'), 'console');
});

test('company members uses real route while other administration gates remain unchanged', () => {
  const ids = (member: AuthUser | null, syntheticPreview = false) =>
    flattenNavItems(visibleNavigation(member, NAV_ITEMS, { syntheticPreview })).map(
      (item) => item.id,
    );
  assert.deepEqual(ids(null), []);
  assert.ok(ids(admin, true).includes('company-members'));
  assert.equal(
    resolveNavigation(
      '/empresa/membros',
      '',
      visibleNavigation(admin, NAV_ITEMS, { syntheticPreview: true }),
    )?.item.id,
    'company-members',
  );
  assert.ok(ids(admin).includes('company-members'));
  assert.ok(ids(user, true).includes('company-members'));
  assert.ok(ids(user).includes('refunds'));
  assert.ok(!ids(user).includes('task-management'));
  assert.ok(!ids(user).includes('admin'));
  assert.ok(!ids(user).includes('operator-activity'));
  for (const tool of ['video-shield', 'creative-studio'] as const) {
    const restricted = ids({ ...user, allowedTools: [tool] });
    assert.ok(restricted.includes('tool-video-studio'));
    assert.ok(restricted.includes('company-members'));
    assert.ok(!restricted.includes('refunds'));
    assert.ok(!restricted.includes('tracking'));
    assert.ok(!restricted.includes('integrations'));
    assert.ok(!restricted.includes('offers'));
  }
});

test('dynamic detail and job routes keep the correct parent without duplicates in search', () => {
  assert.equal(active('/ofertas/qa-offer')?.item.id, 'offers-all');
  const detailTree = visibleNavigation(admin, NAV_ITEMS, { includeDynamic: true });
  const detail = resolveNavigation('/ofertas/qa-offer', '', detailTree);
  assert.deepEqual(
    detail?.trail.map((item) => item.id),
    ['offers', 'offer-detail'],
  );
  assert.equal(active('/tools/cloner/jobs/qa-job')?.item.id, 'tool-page-cloner');
  assert.equal(active('/tools/funnel-clone/jobs/qa-job')?.item.id, 'tool-funnel-clone');
  assert.equal(active('/does-not-exist'), null);
});

test('navigation preserves the selected offer and relevant same-page date filters', () => {
  const items = flattenNavItems(NAV_ITEMS);
  const destination = items.find((item) => item.id === 'integration-meta')!;
  const refund = items.find((item) => item.id === 'refunds')!;
  assert.equal(
    navigationHref(destination, '/ofertas/qa', ''),
    '/tracking?view=destinations&section=meta&offer=qa',
  );
  const url = new URL(
    navigationHref(destination, '/tracking', 'offer=qa&view=journey&from=2026-10-01&to=2026-10-31'),
    'https://example.test',
  );
  assert.equal(url.searchParams.get('offer'), 'qa');
  assert.equal(url.searchParams.get('view'), 'destinations');
  assert.equal(url.searchParams.get('from'), '2026-10-01');
  assert.equal(url.searchParams.get('to'), '2026-10-31');
  assert.equal(navigationHref(refund, '/tracking', 'offer=qa'), '/reembolsos?offer=qa');
  assert.equal(
    navigationHref(refund, '/reembolsos', 'offer_id=legacy'),
    '/reembolsos?offer=legacy',
  );
  assert.equal(navigationHref(refund, '/', ''), '/reembolsos');
});

test('both navigation surfaces use the same resolver and only leaf links declare current page', () => {
  const hub = new URL('../src/components/hub/', import.meta.url);
  const sidebar = readFileSync(new URL('sidebar.tsx', hub), 'utf8');
  const topbar = readFileSync(new URL('topbar.tsx', hub), 'utf8');
  const palette = readFileSync(new URL('command-palette.tsx', hub), 'utf8');
  for (const source of [sidebar, topbar]) assert.match(source, /resolveNavigation\(/);
  for (const source of [sidebar, topbar, palette]) assert.match(source, /visibleNavigation\(/);
  assert.match(sidebar, /aria-expanded=\{submenuOpen\}/);
  assert.doesNotMatch(sidebar, /DropdownMenuTrigger|if \(collapsed\)/);
  assert.match(sidebar, /onFocus=\{\(\) => setHovered\(true\)\}/);
  assert.doesNotMatch(sidebar, /aria-current=\{active \?/);
  assert.doesNotMatch(sidebar, /href=\{item\.href\}/);
  assert.match(sidebar, /if \(active\)\s*\{\s*setExpandedId\(active.root.id\)/);
  assert.match(
    palette,
    /navigationDestinations\(visibleNavigation\(user, undefined, \{ canManageTasks \}\)\)/,
  );
});
