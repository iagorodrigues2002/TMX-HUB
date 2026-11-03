import type { ToolKey } from '@page-cloner/shared';
import Fastify from 'fastify';
import type { Sql } from 'postgres';
import { describe, expect, it, vi } from 'vitest';
import {
  filterCompanyNavigationOffers,
  scopeCompanyNavigationUser,
} from '../src/lib/company-navigation-access.js';
import { effectiveCompanyTools } from '../src/lib/company-tools.js';
import { assertNavigationAccess } from '../src/lib/navigation-access.js';

const rows = [
  { company_id: 'company-a', offer_id: 'offer-a', role: 'owner', status: 'active', tools: [] },
  {
    company_id: 'company-b',
    offer_id: 'offer-b',
    role: 'member',
    status: 'active',
    tools: ['ofertas', 'nav:scoped', 'nav:offers-all'],
  },
];
const sql = vi.fn(async () => rows) as unknown as Sql;
const actor = async () => ({
  sub: 'mixed-member',
  role: 'user' as const,
  tools: await effectiveCompanyTools(sql, 'mixed-member', 'user'),
});

describe('company-local navigation authorization', () => {
  it('does not inherit owner permissions from another company on direct HTTP requests', async () => {
    const app = Fastify();
    const user = await actor();
    // The navigation shell can expose both areas; each resource has its own authority.
    expect(() =>
      assertNavigationAccess(user, '/v1/offers/:id/tracking/upsell-identities', 'GET'),
    ).not.toThrow();
    app.addHook('preHandler', async (req) => {
      const scoped = await scopeCompanyNavigationUser(
        sql,
        user,
        req.routeOptions.url!,
        req.params as Record<string, string>,
      );
      assertNavigationAccess(scoped, req.routeOptions.url!, req.method);
    });
    app.setErrorHandler((error, _req, reply) =>
      reply.code((error as { status?: number }).status ?? 500).send({ error: 'denied' }),
    );
    app.get('/v1/offers/:id/tracking/upsell-identities', async () => ({ private: true }));
    expect((await app.inject('/v1/offers/offer-a/tracking/upsell-identities')).statusCode).toBe(
      200,
    );
    expect((await app.inject('/v1/offers/offer-b/tracking/upsell-identities')).statusCode).toBe(
      403,
    );
    await app.close();
  });

  it('filters aggregate financial data per offer section without hiding permitted company data', async () => {
    const offers = [{ id: 'offer-a' }, { id: 'offer-b' }];
    const user = await actor();
    for (const path of ['/v1/tracking/overview', '/v1/tracking/refunds-dashboard']) {
      expect(await filterCompanyNavigationOffers(sql, user, offers, path)).toEqual([offers[0]]);
    }
    expect(await filterCompanyNavigationOffers(sql, user, offers, '/v1/offers')).toEqual(offers);
  });

  it('preserves legacy/global administration and account-level caps', async () => {
    const unbound = vi.fn(async () => []) as unknown as Sql;
    const user = { sub: 'legacy', role: 'user' as const, tools: undefined };
    expect(
      await scopeCompanyNavigationUser(unbound, user, '/v1/offers/:id', { id: 'old' }),
    ).toEqual(user);
    const admin = { sub: 'admin', role: 'admin' as const, tools: undefined };
    expect(
      await scopeCompanyNavigationUser(sql, admin, '/v1/offers/:id', { id: 'offer-b' }),
    ).toEqual(admin);
    const capped = {
      ...(await actor()),
      tools: ['ofertas', 'nav:scoped', 'nav:offers-all'] as ToolKey[],
    };
    expect(
      await filterCompanyNavigationOffers(
        sql,
        capped,
        [{ id: 'offer-a' }],
        '/v1/tracking/overview',
      ),
    ).toEqual([]);
  });

  it('fails closed for revoked company memberships even when another company remains active', async () => {
    const revoked = vi.fn(async () => [{ ...rows[1], status: 'suspended' }]) as unknown as Sql;
    const user = await actor();
    await expect(
      scopeCompanyNavigationUser(revoked, user, '/v1/offers/:id', { id: 'offer-b' }),
    ).rejects.toMatchObject({ status: 403 });
    expect(
      await filterCompanyNavigationOffers(
        revoked,
        user,
        [{ id: 'offer-b' }],
        '/v1/tracking/overview',
      ),
    ).toEqual([]);
  });

  it('applies the same boundary to company finance and does not authorize absent memberships', async () => {
    const user = await actor();
    const scoped = await scopeCompanyNavigationUser(sql, user, '/v1/companies/:id/finance', {
      id: 'company-b',
    });
    expect(() => assertNavigationAccess(scoped, '/v1/companies/:id/finance', 'GET')).toThrow();
    const absent = vi.fn(async () => [
      { ...rows[1], status: null, role: null, tools: null },
    ]) as unknown as Sql;
    await expect(
      scopeCompanyNavigationUser(absent, user, '/v1/offers/:id', { id: 'offer-b' }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('retains old per-company base grants when no explicit navigation list exists', async () => {
    const legacy = vi.fn(async () => [{ ...rows[1], tools: ['ofertas'] }]) as unknown as Sql;
    const user = await actor();
    expect(
      await filterCompanyNavigationOffers(
        legacy,
        user,
        [{ id: 'offer-b' }],
        '/v1/tracking/overview',
      ),
    ).toEqual([{ id: 'offer-b' }]);
  });
});
