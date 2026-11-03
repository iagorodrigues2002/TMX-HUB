import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Offer } from '@page-cloner/shared';
import Fastify from 'fastify';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { saleNoticePreferenceRoutes } from '../src/routes/sale-notice-preferences.js';
import { registerGetSaleNotices } from '../src/routes/tracking-overview/get-sale-notices.js';
import { OfferStore } from '../src/services/offer-store.js';
import { saleNoticeOffers } from '../src/services/sale-notice-preferences.js';

describe.skipIf(!process.env.TASK_TEST_DATABASE_URL)(
  'notification company boundary in PostgreSQL',
  () => {
    const schema = `notice_${randomUUID().replaceAll('-', '')}`;
    const company = randomUUID();
    const otherCompany = randomUUID();
    let root: ReturnType<typeof postgres>;
    let db: ReturnType<typeof postgres>;
    let store: OfferStore;
    const redis = { get: async () => null };
    const user = (sub: string) => ({
      sub,
      role: sub === 'global' || sub === 'global2' ? 'admin' : 'user',
    });
    async function request(actor: string, method: 'GET' | 'PUT', url: string, payload?: object) {
      const app = Fastify();
      app.decorate('db', db);
      app.decorate('redis', redis);
      app.decorate('offerStore', store);
      app.addHook('preHandler', async (req) => {
        req.user = { ...user(actor), email: 'synthetic@test.invalid', iat: 0, exp: 0 } as never;
      });
      await app.register(saleNoticePreferenceRoutes);
      registerGetSaleNotices(app);
      try {
        return await app.inject({ method, url, payload });
      } finally {
        await app.close();
      }
    }
    const prefs = '/tracking/sale-notice-preferences';
    beforeAll(async () => {
      const url = new URL(process.env.TASK_TEST_DATABASE_URL!);
      if (
        url.hostname !== '127.0.0.1' ||
        url.username !== 'tmx_tasks_test' ||
        url.pathname !== '/tmx_tasks_test'
      )
        throw Error('Only isolated test database');
      root = postgres(url.toString(), { max: 1, onnotice: () => {} });
      await root.unsafe(`CREATE SCHEMA ${schema}`);
      db = postgres(url.toString(), {
        max: 3,
        connection: { search_path: schema },
        onnotice: () => {},
      });
      for (const file of ['109_company_memberships.sql', '111_sale_notice_preferences.sql'])
        await db.unsafe(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
      await db`INSERT INTO companies(id,name,created_by) VALUES(${company},'Same name','owner'),(${otherCompany},'Same name','outsider')`;
      await db`INSERT INTO company_memberships(company_id,user_id,role,tools) VALUES(${company},'member','member',ARRAY['ofertas']),(${company},'owner','owner',ARRAY['ofertas']),(${otherCompany},'outsider','owner',ARRAY['ofertas'])`;
      await db`INSERT INTO company_offers(company_id,offer_id,owner_user_id) VALUES(${company},'a','owner'),(${company},'b','owner'),(${otherCompany},'foreign','outsider')`;
      await db`INSERT INTO company_offer_grants(company_id,user_id,offer_id) VALUES(${company},'member','a')`;
      store = new OfferStore(redis as never, 'synthetic-only', db);
      vi.spyOn(store, 'listAll').mockResolvedValue(
        ['a', 'b', 'foreign'].map(
          (id) =>
            ({
              id,
              name: id,
              companyName: 'Same name',
              userId: id === 'foreign' ? 'outsider' : 'owner',
              status: 'testando',
              createdAt: new Date().toISOString(),
            }) as Offer,
        ),
      );
      await db`CREATE TABLE tracking_projects(id text,offer_id text)`;
      await db`CREATE TABLE tracking_orders(id text,project_id text,status text,provider text,amount_minor text,currency text,occurred_at timestamptz)`;
      await db`CREATE TABLE browser_sale_events(order_id text PRIMARY KEY,created_at timestamptz NOT NULL DEFAULT now())`;
      for (const id of ['a', 'b', 'foreign']) {
        await db`INSERT INTO tracking_projects VALUES(${id},${id})`;
        await db`INSERT INTO tracking_orders VALUES(${id},${id},'paid','synthetic','100','BRL',now())`;
        await db`INSERT INTO browser_sale_events(order_id) VALUES(${id})`;
      }
    });
    afterAll(async () => {
      await db?.end();
      await root?.unsafe(`DROP SCHEMA ${schema} CASCADE`);
      await root?.end();
    });
    it('separates companies by ID even with identical names; global admins can select all', async () => {
      for (const [actor, ids] of [
        ['member', ['a']],
        ['outsider', ['foreign']],
        ['owner', ['a', 'b']],
        ['global', ['a', 'b', 'foreign']],
      ] as const) {
        const res = await request(actor, 'GET', prefs);
        expect(res.statusCode).toBe(200);
        expect(res.json().offer_ids.sort()).toEqual([...ids].sort());
      }
      expect((await request('member', 'PUT', prefs, { offer_ids: ['b'] })).statusCode).toBe(403);
      expect((await request('outsider', 'PUT', prefs, { offer_ids: ['a'] })).statusCode).toBe(403);
    });
    it('personal opt-out does not change other admins and can be reenabled', async () => {
      expect((await request('global', 'PUT', prefs, { offer_ids: [] })).statusCode).toBe(200);
      expect((await request('global', 'GET', prefs)).json().offer_ids).toEqual([]);
      expect((await request('global2', 'GET', prefs)).json().offer_ids).toHaveLength(3);
      expect((await request('member', 'PUT', prefs, { offer_ids: ['a'] })).statusCode).toBe(200);
    });
    it('polling returns only sales for currently permitted and enabled offers', async () => {
      const since = new Date(Date.now() - 60000).toISOString();
      for (const [actor, ids] of [
        ['member', ['a']],
        ['outsider', ['foreign']],
        ['global', []],
      ] as const) {
        const res = await request(
          actor,
          'GET',
          `/tracking/sale-notices?since=${encodeURIComponent(since)}`,
        );
        expect(res.statusCode).toBe(200);
        expect(res.json().items.map((o: { offerId: string }) => o.offerId)).toEqual(ids);
      }
    });
    it('revocation overrides saved preferences; empty tools and suspension fail closed', async () => {
      const app = { db, redis, offerStore: store } as never;
      await db`DELETE FROM company_offer_grants WHERE company_id=${company} AND user_id='member'`;
      expect(await saleNoticeOffers(app, user('member'))).toEqual([]);
      await db`UPDATE company_memberships SET tools='{}' WHERE user_id='member'`;
      expect(await saleNoticeOffers(app, user('member'))).toEqual([]);
      await db`UPDATE company_memberships SET status='suspended' WHERE user_id='member'`;
      await expect(saleNoticeOffers(app, user('member'))).rejects.toThrow(
        'Acesso empresarial suspenso',
      );
    });
  },
);
