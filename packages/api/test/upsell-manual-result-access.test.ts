import type { ToolKey } from '@page-cloner/shared';
import Fastify from 'fastify';
import type { Redis } from 'ioredis';
import type { Sql } from 'postgres';
import { describe, expect, it, vi } from 'vitest';
import { scopeCompanyNavigationUser } from '../src/lib/company-navigation-access.js';
import { assertNavigationAccess } from '../src/lib/navigation-access.js';
import errorHandler from '../src/plugins/error-handler.js';
import { createCnameTargetContext } from '../src/routes/tracking-advanced/cname-target-context.js';
import { registerGetUpsellIdentitiesOrderIdStagesStageIdSyzepayCheckRoutes } from '../src/routes/tracking-advanced/get-upsell-identities-order-id-stages-stage-id-syzepay-check.js';
import { OfferStore } from '../src/services/offer-store.js';

vi.mock('../src/env.js', () => ({
  env: { PUBLIC_BASE_URL: 'https://tmx.test', TRACKING_PUBLIC_BASE_URL: 'https://tmx.test' },
}));

async function fixture(options: { granted?: boolean; section?: boolean; active?: boolean } = {}) {
  const app = Fastify();
  const tools: ToolKey[] = ['ofertas', 'nav:scoped'];
  if (options.section !== false) tools.push('nav:tracking-upsell-intelligence');
  const membership = {
    company_id: 'company-a',
    offer_id: 'offer-a',
    role: 'member',
    status: options.active === false ? 'suspended' : 'active',
    tools,
    all_offers: false,
    granted: options.granted !== false,
  };
  const writes: unknown[][] = [];
  const db = vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const sql = strings.join('?');
    if (sql.includes('FROM company_offers'))
      return values.includes('offer-b')
        ? [
            {
              ...membership,
              offer_id: 'offer-b',
              company_id: 'company-b',
              status: null,
              role: null,
            },
          ]
        : [membership];
    if (sql.includes('FROM tracking_projects')) return [{ id: 'project-a', public_key: 'key' }];
    if (sql.includes('o.id AS order_id,s.id AS stage_id')) {
      expect(sql).toContain('s.project_id=o.project_id');
      expect(sql).toContain("o.order_kind='front' AND o.paid_at IS NOT NULL");
      return values[0] === 'front-a' && values[1] === 'stage-a' && values[2] === 'project-a'
        ? [{ order_id: 'front-a', stage_id: 'stage-a' }]
        : [];
    }
    if (sql.includes('INSERT INTO tracking_upsell_manual_test_results')) {
      writes.push(values);
      return [];
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  }) as unknown as Sql;
  const store = new OfferStore({} as Redis, 'synthetic-only', db);
  vi.spyOn(store, 'get').mockResolvedValue({
    id: 'offer-a',
    userId: 'owner-a',
    name: 'Test',
    status: 'testando',
    createdAt: new Date().toISOString(),
  });
  app.decorate('db', db);
  app.decorate('offerStore', store);
  await app.register(errorHandler);
  app.addHook('preHandler', async (req) => {
    req.user = await scopeCompanyNavigationUser(
      db,
      {
        sub: 'operator',
        role: 'user',
        email: 'operator@example.test',
        tools,
        iat: 0,
        exp: 0,
      },
      req.routeOptions.url!,
      req.params as Record<string, string>,
    );
    assertNavigationAccess(req.user, req.routeOptions.url!, req.method);
  });
  registerGetUpsellIdentitiesOrderIdStagesStageIdSyzepayCheckRoutes(
    app,
    createCnameTargetContext(app),
  );
  return { app, writes, store };
}

const target = '/offers/offer-a/tracking/upsell-identities/front-a/stages/stage-a/result';

describe('manual upsell result for authorized company operators', () => {
  it.each(['worked', 'failed'] as const)(
    'saves %s without tracking administration rights',
    async (result) => {
      const { app, writes, store } = await fixture();
      try {
        await expect(store.assertTrackingManager('offer-a', 'operator')).rejects.toMatchObject({
          status: 403,
        });
        const response = await app.inject({ method: 'PUT', url: target, payload: { result } });
        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ saved: true, result });
        expect(writes).toEqual([['project-a', 'front-a', 'stage-a', result, 'operator']]);
      } finally {
        await app.close();
      }
    },
  );

  it.each([
    [{ granted: false }, 404],
    [{ section: false }, 403],
    [{ active: false }, 403],
  ] as const)('rejects access outside grants %j', async (options, status) => {
    const { app, writes } = await fixture(options);
    try {
      expect(
        (await app.inject({ method: 'PUT', url: target, payload: { result: 'worked' } }))
          .statusCode,
      ).toBe(status);
      expect(writes).toHaveLength(0);
    } finally {
      await app.close();
    }
  });

  it.each([target.replace('front-a', 'foreign-front'), target.replace('stage-a', 'foreign-stage')])(
    'rejects an order or stage from another project',
    async (url) => {
      const { app, writes } = await fixture();
      try {
        expect(
          (await app.inject({ method: 'PUT', url, payload: { result: 'worked' } })).statusCode,
        ).toBe(404);
        expect(writes).toHaveLength(0);
      } finally {
        await app.close();
      }
    },
  );

  it('does not grant recovery/configuration rights or permit a purchase result', async () => {
    const { app, writes } = await fixture();
    try {
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/offers/offer-a/tracking/upsell-identities/recover-failed',
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (await app.inject({ method: 'PUT', url: target, payload: { result: 'purchased' } }))
          .statusCode,
      ).toBe(422);
      expect(writes).toHaveLength(0);
    } finally {
      await app.close();
    }
  });

  it('rejects another company even if the account has the same navigation tool', async () => {
    const { app, writes } = await fixture();
    try {
      expect(
        (
          await app.inject({
            method: 'PUT',
            url: target.replace('offer-a', 'offer-b'),
            payload: { result: 'worked' },
          })
        ).statusCode,
      ).toBe(403);
      expect(writes).toHaveLength(0);
    } finally {
      await app.close();
    }
  });
});
