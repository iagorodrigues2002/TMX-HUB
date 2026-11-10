import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  navigationTools,
  permissionGroups,
  selectedNavigation,
} from '../src/components/admin/company-navigation-access';
import { visibleNavigation } from '../src/components/hub/navigation';
import type { AuthUser } from '../src/lib/api-client/auth-types';

test('permissions reuse sidebar labels and hierarchy, without exposing global admin as a grant', () => {
  assert.deepEqual(
    permissionGroups.map((group) => group.label),
    [
      'Visão geral',
      'Ofertas',
      'Tráfego',
      'Spy',
      'Rastreamento',
      'Empresa',
      'Ferramentas',
      'Integrações',
    ],
  );
  assert.ok(
    permissionGroups
      .find((group) => group.id === 'tracking')
      ?.entries.some((item) => item.id === 'tracking-upsell-intelligence'),
  );
  assert.ok(!permissionGroups.some((group) => group.id === 'admin'));
});
test('catalog does not enable intelligence or overview and selection survives serialization', () => {
  const tools = navigationTools(['offers-all'], []);
  assert.deepEqual(selectedNavigation(JSON.parse(JSON.stringify(tools))), ['offers-all']);
  assert.ok(tools.includes('ofertas'));
  const user = {
    id: 'member',
    name: 'Member',
    email: 'member@example.test',
    role: 'user',
    allowedTools: tools,
    createdAt: '',
  } as AuthUser;
  const visible = visibleNavigation(user);
  assert.ok(!visible.some((group) => group.id === 'tracking' || group.id === 'overview'));
  assert.deepEqual(
    visible.find((group) => group.id === 'offers')?.children?.map((child) => child.id),
    ['offers-all'],
  );
});
test('traffic tabs can be granted and revoked individually without granting System User configuration', () => {
  const tools = navigationTools(['traffic-campaigns'], []);
  assert.deepEqual(selectedNavigation(tools), ['traffic-campaigns']);
  assert.ok(tools.includes('ofertas'));
  assert.ok(!tools.includes('nav:traffic-settings'));
  assert.equal(permissionGroups.find((g) => g.label === 'Tráfego')?.entries.length, 5);
  assert.deepEqual(selectedNavigation(navigationTools([], tools)), []);
});
test('empty selection is explicit and legacy offers selection is understood before editing', () => {
  assert.deepEqual(navigationTools([], ['ofertas']), ['nav:scoped']);
  assert.ok(selectedNavigation(['ofertas']).includes('tracking-upsell-intelligence'));
  assert.ok(!selectedNavigation(['ofertas']).includes('ads-intelligence'));
});

test('operator results can be explicitly delegated without other administrative access', () => {
  const tools = navigationTools(['operator-activity'], []);
  assert.ok(tools.includes('logs'));
  assert.ok(tools.includes('ofertas'));
  assert.deepEqual(selectedNavigation(tools), ['operator-activity']);
  const item = permissionGroups
    .flatMap((group) => group.entries)
    .find((entry) => entry.id === 'operator-activity');
  assert.equal(item?.roles, undefined);
  const user = {
    id: 'member',
    name: 'Member',
    email: 'member@test',
    role: 'user',
    allowedTools: tools,
    createdAt: '',
  } as AuthUser;
  const children = visibleNavigation(user).flatMap((group) => group.children ?? [group]);
  assert.deepEqual(
    children.map((child) => child.id),
    ['operator-activity'],
  );
  assert.ok(!selectedNavigation(['logs']).includes('operator-activity'));
});
