import Fastify from 'fastify';
import type { Sql } from 'postgres';
import { expect, it, vi } from 'vitest';
import type { createCnameTargetContext } from '../src/routes/tracking-advanced/cname-target-context.js';
import { registerGetUpsellIdentitiesRoutes } from '../src/routes/tracking-advanced/get-upsell-identities.js';

vi.mock('../src/env.js', () => ({ env: { TRACKING_ENCRYPTION_KEY: 'synthetic' } }));

it('bounds buyer enrichment to the requested page and preserves the full total', async () => {
  const app = Fastify();
  let pageSql = '';
  let pageValues: unknown[] = [];
  const db = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const sql = strings.join('?');
    if (sql.includes('confirmed_vendid_encrypted')) {
      pageSql = sql;
      pageValues = values;
      return [];
    }
    if (sql.includes('count(*)')) return [{ total: 1477 }];
    return [];
  };
  app.decorate('db', db as unknown as Sql);
  const context = { project: async () => ({ id: 'project-a' }) };
  registerGetUpsellIdentitiesRoutes(
    app,
    context as unknown as ReturnType<typeof createCnameTargetContext>,
  );
  app.addHook('preHandler', async (req) => {
    req.user = { sub: 'user-a', role: 'admin' } as typeof req.user;
  });
  try {
    const response = await app.inject(
      '/offers/offer-a/tracking/upsell-identities?all=true&limit=20&offset=1460',
    );
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ items: [], total: 1477, limit: 20, offset: 1460 });
    // The database must limit front rows before lateral lookups and correlated enrichment.
    expect(pageSql.indexOf('LIMIT')).toBeLessThan(pageSql.indexOf('EXISTS'));
    expect(pageSql).toMatch(/AS MATERIALIZED/);
    expect(pageValues).toContain(1460);
    expect(pageValues).toContain('project-a');
  } finally {
    await app.close();
  }
});
