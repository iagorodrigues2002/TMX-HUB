import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildTrackingHref,
  resolveTrackingLocation,
  trackingWorkspaceNavigation,
} from '../src/components/tracking/tracking-nav';

test('tracking context does not repeat the entire integrations or single upsell navigation', () => {
  assert.deepEqual(trackingWorkspaceNavigation('destinations', 'meta').sections, []);
  assert.equal(trackingWorkspaceNavigation('destinations', 'meta').title, 'Meta');
  assert.deepEqual(
    trackingWorkspaceNavigation('upsell-intelligence', 'upsell-intelligence').sections,
    [],
  );
  assert.equal(trackingWorkspaceNavigation('overview', 'summary').title, 'Resumo da oferta');
});

test('payment settings and diagnostics have separate, reachable contextual sections', () => {
  for (const section of ['payments', 'fees']) {
    assert.deepEqual(
      trackingWorkspaceNavigation('finance', section).sections.map((s) => s.id),
      ['payments', 'fees'],
    );
  }
  for (const section of ['health', 'console', 'help']) {
    assert.deepEqual(
      trackingWorkspaceNavigation('finance', section).sections.map((s) => s.id),
      ['health', 'console', 'help'],
    );
  }
});

test('published deep links keep their canonical destination', () => {
  assert.deepEqual(resolveTrackingLocation('destinations', 'tiktok'), {
    view: 'destinations',
    section: 'tiktok-ads',
  });
  assert.deepEqual(resolveTrackingLocation('journey', 'upsells'), {
    view: 'upsell-intelligence',
    section: 'upsell-intelligence',
  });
  assert.deepEqual(resolveTrackingLocation('diagnostics', 'console'), {
    view: 'finance',
    section: 'console',
  });
  assert.deepEqual(resolveTrackingLocation('destinations', 'payments'), {
    view: 'finance',
    section: 'payments',
  });
});

test('contextual navigation retains offer, dates and other active filters', () => {
  const href = buildTrackingHref({
    view: 'finance',
    section: 'fees',
    offerId: 'offer-b',
    searchParams:
      'offer=offer-a&view=journey&section=live&from=2026-10-01&to=2026-10-31&gateway=vendepay',
  });
  const params = new URL(href, 'https://local.test').searchParams;
  assert.equal(params.get('offer'), 'offer-b');
  assert.equal(params.get('section'), 'fees');
  assert.equal(params.get('from'), '2026-10-01');
  assert.equal(params.get('to'), '2026-10-31');
  assert.equal(params.get('gateway'), 'vendepay');
  assert.equal(params.getAll('view').length, 1);
});
