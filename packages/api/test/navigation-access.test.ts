import Fastify from 'fastify';
import type { Sql } from 'postgres';
import { describe, expect, it } from 'vitest';
import { effectiveCompanyTools } from '../src/lib/company-tools.js';
import { assertNavigationAccess, canReadNavigation } from '../src/lib/navigation-access.js';

const member = (ids: string[]) => ({
  role: 'user',
  tools: ['ofertas', 'nav:scoped', ...ids.map((id) => `nav:${id}`)],
});
describe('navigation section permissions', () => {
  it('does not expose finance or reports through contingency/settings grants', () => {
    for (const id of ['traffic-contingency', 'traffic-settings'])
      for (const path of ['attribution', 'finance', 'finance-overview', 'connection/report'])
        expect(() =>
          assertNavigationAccess(member([id]), `/v1/meta-control/traffic/${path}`, 'GET'),
        ).toThrow();
    for (const id of ['traffic-overview', 'traffic-campaigns', 'traffic-windows'])
      for (const path of ['attribution', 'finance', 'finance-overview', 'connection/report'])
        expect(() =>
          assertNavigationAccess(member([id]), `/v1/meta-control/traffic/${path}`, 'GET'),
        ).not.toThrow();
  });
  it('separates traffic view access from token configuration and inventory', () => {
    const viewer = member(['traffic-campaigns']);
    expect(() =>
      assertNavigationAccess(viewer, '/v1/meta-control/campaigns/local-import', 'GET'),
    ).not.toThrow();
    expect(() =>
      assertNavigationAccess(member(['offers-all']), '/v1/meta-control/traffic/status', 'GET'),
    ).toThrow();
    expect(() =>
      assertNavigationAccess(viewer, '/v1/meta-control/traffic/connection', 'POST'),
    ).toThrow();
    expect(() =>
      assertNavigationAccess(
        member(['traffic-settings']),
        '/v1/meta-control/traffic/connection',
        'POST',
      ),
    ).not.toThrow();
    expect(() => assertNavigationAccess(viewer, '/v1/meta-control/inventory', 'GET')).toThrow();
  });
  it('requires the delegated activity grant for both report paths, separate from operating upsells', () => {
    for (const path of [
      '/v1/activity',
      '/v1/tracking/upsell-operator-logs',
      '/v1/offers/:id/tracking/upsell-operator-logs',
    ]) {
      expect(() =>
        assertNavigationAccess(member(['operator-activity']), path, 'GET'),
      ).not.toThrow();
      expect(() =>
        assertNavigationAccess(member(['tracking-upsell-intelligence']), path, 'GET'),
      ).toThrow();
      expect(() =>
        assertNavigationAccess({ role: 'user', tools: ['ofertas', 'logs'] }, path, 'GET'),
      ).toThrow();
    }
  });
  it('gates task and call management but keeps participant notifications separately authorized', () => {
    for (const path of [
      '/v1/tasks',
      '/v1/tasks/access',
      '/v1/tasks/:id',
      '/v1/calls',
      '/v1/calls/:id',
    ]) {
      for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) {
        expect(() => assertNavigationAccess(member([]), path, method)).toThrow();
        expect(() =>
          assertNavigationAccess(member(['task-management']), path, method),
        ).not.toThrow();
      }
    }
    expect(() =>
      assertNavigationAccess(member([]), '/v1/calls/notifications', 'GET'),
    ).not.toThrow();
    expect(() =>
      assertNavigationAccess(member([]), '/v1/calls/notifications/:id/read', 'POST'),
    ).not.toThrow();
    expect(() =>
      assertNavigationAccess(member([]), '/v1/calls/notifications/unknown', 'PATCH'),
    ).toThrow();
  });
  it('separates catalog, intelligence, integrations and finance even with the base offer tool', () => {
    const user = member(['offers-all']);
    expect(() => assertNavigationAccess(user, '/v1/offers', 'GET')).not.toThrow();
    expect(() => assertNavigationAccess(user, '/v1/offers', 'POST')).not.toThrow();
    for (const path of [
      '/v1/offers/:id/tracking/upsell-identities',
      '/v1/ads-intelligence',
      '/v1/tracking/refunds-dashboard',
      '/v1/tracking/reserve-projection',
      '/v1/offers/:id/tracking/meta-rules',
      '/v1/offers/:id/tracking/future-endpoint',
    ]) {
      expect(() => assertNavigationAccess(user, path, 'GET')).toThrow();
    }
    expect(canReadNavigation(user, 'integration-payments')).toBe(false);
  });
  it('allows only the chosen subtab, including mutation routes', () => {
    const user = member(['tracking-upsell-intelligence']);
    expect(() =>
      assertNavigationAccess(
        user,
        '/v1/offers/:id/tracking/upsell-identities/:orderId/stages/:stageId/result',
        'PUT',
      ),
    ).not.toThrow();
    expect(() =>
      assertNavigationAccess(user, '/v1/offers/:id/tracking/utmify-pixel', 'PUT'),
    ).toThrow();
    expect(() => assertNavigationAccess(user, '/v1/offers', 'POST')).toThrow();
    expect(() => assertNavigationAccess(user, '/v1/tracking/browser-push', 'PUT')).not.toThrow();
  });
  it('preserves legacy and global administration without granting a global role', () => {
    expect(() =>
      assertNavigationAccess(
        { role: 'user', tools: ['ofertas'] },
        '/v1/tracking/refunds-dashboard',
        'GET',
      ),
    ).not.toThrow();
    expect(() =>
      assertNavigationAccess({ role: 'admin', tools: [] }, '/v1/tracking/refunds-dashboard', 'GET'),
    ).not.toThrow();
    expect(() =>
      assertNavigationAccess(member([]), '/v1/tracking/refunds-dashboard', 'GET'),
    ).toThrow();
  });
  it('keeps scoped restrictions when a legacy account-level tool cap exists', async () => {
    const db = (async () => [
      { role: 'member', status: 'active', tools: ['ofertas', 'nav:scoped', 'nav:offers-all'] },
    ]) as unknown as Sql;
    const tools = await effectiveCompanyTools(db, 'member', 'user', ['ofertas']);
    expect(tools).toContain('nav:scoped');
    expect(() =>
      assertNavigationAccess({ role: 'user', tools }, '/v1/tracking/refunds-dashboard', 'GET'),
    ).toThrow();
  });
  it('rejects direct HTTP access using canonical route patterns, not attacker encoding', async () => {
    const app = Fastify();
    app.addHook('preHandler', async (req, reply) => {
      try {
        assertNavigationAccess(member(['offers-all']), req.routeOptions.url!, req.method);
      } catch {
        return reply.code(403).send({ error: 'section_forbidden' });
      }
    });
    app.get('/v1/offers/:id/tracking/upsell-identities', async () => ({ private: true }));
    for (const path of [
      '/v1/offers/abc/tracking/upsell-identities',
      '/v1/offers/a%62c/tracking/upsell-identities?view=offers',
    ]) {
      expect((await app.inject(path)).statusCode).toBe(403);
    }
    await app.close();
  });
});
