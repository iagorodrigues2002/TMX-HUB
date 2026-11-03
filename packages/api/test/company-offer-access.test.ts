import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Offer } from '@page-cloner/shared';
import type { Redis } from 'ioredis';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OfferStore } from '../src/services/offer-store.js';

describe.skipIf(!process.env.TASK_TEST_DATABASE_URL)(
  'company OfferStore access in PostgreSQL',
  () => {
    const schema = `company_offers_${randomUUID().replaceAll('-', '')}`;
    const company = randomUUID();
    const otherCompany = randomUUID();
    let root: ReturnType<typeof postgres>;
    let db: ReturnType<typeof postgres>;
    let store: OfferStore;
    const offer = (id: string, userId = 'owner'): Offer => ({
      id,
      userId,
      name: id,
      status: 'testando',
      createdAt: new Date().toISOString(),
    });
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
      await db.unsafe(
        readFileSync(new URL('../migrations/109_company_memberships.sql', import.meta.url), 'utf8'),
      );
      store = new OfferStore({} as Redis, 'synthetic-only', db);
      await db`INSERT INTO companies(id,name,created_by) VALUES(${company},'Same label','owner'),(${otherCompany},'Same label','owner2')`;
      await db`INSERT INTO company_memberships(company_id,user_id,role,tools) VALUES
      (${company},'owner','owner',ARRAY['ofertas']),(${company},'member','member',ARRAY['ofertas']),
      (${company},'manager','admin',ARRAY[]::text[]),(${otherCompany},'owner2','owner',ARRAY['ofertas'])`;
      await db`INSERT INTO company_offers(company_id,offer_id,owner_user_id) VALUES
      (${company},'selected','owner'),(${company},'not-selected','owner'),(${otherCompany},'other','owner2')`;
      await db`INSERT INTO company_offer_grants(company_id,user_id,offer_id) VALUES(${company},'member','selected')`;
    });
    afterAll(async () => {
      await db?.end();
      await root?.unsafe(`DROP SCHEMA ${schema} CASCADE`);
      await root?.end();
    });
    it('member sees selected offer only and can never manage it', async () => {
      expect(await store.permissions(offer('selected'), 'member')).toEqual({
        read: true,
        manage: false,
      });
      expect(await store.permissions(offer('not-selected'), 'member')).toEqual({
        read: false,
        manage: false,
      });
      expect(await store.permissions(offer('other', 'owner2'), 'member')).toEqual({
        read: false,
        manage: false,
      });
    });
    it('company admin manages own company only; explicit global admin remains separate', async () => {
      expect(await store.permissions(offer('selected'), 'manager')).toEqual({
        read: true,
        manage: true,
      });
      expect(await store.permissions(offer('other', 'owner2'), 'manager')).toEqual({
        read: false,
        manage: false,
      });
      expect(await store.permissions(offer('other', 'owner2'), 'global', true)).toEqual({
        read: true,
        manage: true,
      });
    });
    it('bound original owner cannot bypass suspended membership', async () => {
      await db`UPDATE company_memberships SET status='suspended' WHERE company_id=${company} AND user_id='owner'`;
      expect(await store.permissions(offer('selected'), 'owner')).toEqual({
        read: false,
        manage: false,
      });
    });
    it('revoking tools and grants is effective on the next read without a cached allowance', async () => {
      await db`UPDATE company_memberships SET tools='{}' WHERE company_id=${company} AND user_id='member'`;
      expect(await store.permissions(offer('selected'), 'member')).toEqual({
        read: false,
        manage: false,
      });
      await db`UPDATE company_memberships SET tools=ARRAY['ofertas'] WHERE company_id=${company} AND user_id='member'`;
      expect(await store.permissions(offer('selected'), 'member')).toEqual({
        read: true,
        manage: false,
      });
      await db`DELETE FROM company_offer_grants WHERE company_id=${company} AND user_id='member'`;
      expect(await store.permissions(offer('selected'), 'member')).toEqual({
        read: false,
        manage: false,
      });
      await db`UPDATE company_memberships SET all_offers=true WHERE company_id=${company} AND user_id='member'`;
      expect(await store.permissions(offer('not-selected'), 'member')).toEqual({
        read: true,
        manage: false,
      });
      expect(await store.permissions(offer('other', 'owner2'), 'member')).toEqual({
        read: false,
        manage: false,
      });
    });
    it('unbound legacy sharing never grants collaborator access', async () => {
      expect(
        await store.permissions({ ...offer('legacy'), memberIds: ['member'] }, 'member'),
      ).toEqual({ read: false, manage: false });
      expect(await store.permissions(offer('legacy'), 'owner')).toEqual({
        read: true,
        manage: true,
      });
    });
  },
);
