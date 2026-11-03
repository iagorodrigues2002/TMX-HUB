import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import Fastify from 'fastify';
import Redis from 'ioredis';
import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { signJwt } from '../src/lib/jwt.js';
import { HttpProblem } from '../src/lib/problem.js';
import authPlugin from '../src/plugins/auth.js';
import { companyRoutes } from '../src/routes/companies.js';
import usersRoutes from '../src/routes/users.js';
import { UserStore } from '../src/services/user-store.js';

describe.skipIf(!process.env.USER_ROLE_TEST_REDIS_URL || !process.env.TASK_TEST_DATABASE_URL)(
  'global role changes',
  () => {
    let redis: Redis;
    let store: UserStore;
    let adminId: string;
    let memberId: string;
    let app: ReturnType<typeof Fastify>;
    const schema = `global_roles_${randomUUID().replaceAll('-', '')}`;
    let root: ReturnType<typeof postgres>;
    let db: ReturnType<typeof postgres>;
    let company: string;
    beforeAll(async () => {
      const url = new URL(process.env.USER_ROLE_TEST_REDIS_URL!);
      if (
        process.env.NODE_ENV !== 'test' ||
        url.hostname !== '127.0.0.1' ||
        url.port !== process.env.USER_ROLE_TEST_REDIS_PORT ||
        url.pathname !== '/15'
      )
        throw Error('Only an explicitly isolated Redis database 15 is permitted');
      const dbUrl = new URL(process.env.TASK_TEST_DATABASE_URL!);
      if (
        dbUrl.hostname !== '127.0.0.1' ||
        dbUrl.username !== 'tmx_tasks_test' ||
        dbUrl.pathname !== '/tmx_tasks_test'
      )
        throw Error('Only an isolated task test database is permitted');
      root = postgres(dbUrl.toString(), { max: 1, onnotice: () => {} });
      await root.unsafe(`CREATE SCHEMA ${schema}`);
      db = postgres(dbUrl.toString(), {
        max: 2,
        connection: { search_path: schema },
        onnotice: () => {},
      });
      await db.unsafe(
        readFileSync(new URL('../migrations/109_company_memberships.sql', import.meta.url), 'utf8'),
      );
      redis = new Redis(url.toString(), { maxRetriesPerRequest: 1 });
      store = new UserStore(redis);
      app = Fastify();
      app.decorate('redis', redis);
      app.decorate('db', db);
      app.decorate('offerStore', { listAccessible: async () => [] } as never);
      app.setErrorHandler((error, _req, reply) =>
        reply.code(error instanceof HttpProblem ? error.status : 500).send({ code: error.code }),
      );
      await app.register(authPlugin);
      app.addHook('preHandler', app.requireAuth);
      await app.register(usersRoutes);
      await app.register(companyRoutes);
    });
    beforeEach(async () => {
      await redis.flushdb();
      adminId = (
        await store.create({
          email: 'admin@example.test',
          name: 'Admin',
          role: 'admin',
          passwordHash: 'synthetic',
        })
      ).id;
      memberId = (
        await store.create({
          email: 'manager@example.test',
          name: 'Company manager',
          role: 'user',
          passwordHash: 'synthetic',
        })
      ).id;
      company = randomUUID();
      await db`INSERT INTO companies(id,name,created_by) VALUES(${company},'Test company',${adminId})`;
      await db`INSERT INTO company_memberships(company_id,user_id,role,tools,all_offers) VALUES
      (${company},${adminId},'owner','{}',true), (${company},${memberId},'admin','{}',false)`;
    });
    afterAll(async () => {
      await app?.close();
      await redis?.flushdb();
      redis?.disconnect();
      await db?.end();
      await root?.unsafe(`DROP SCHEMA ${schema} CASCADE`);
      await root?.end();
    });
    function headers(id: string, role: 'admin' | 'user') {
      const { token } = signJwt(
        { sub: id, role, email: 'fixture@example.test' },
        process.env.JWT_SECRET!,
      );
      return { authorization: `Bearer ${token}` };
    }
    it('denies a company administrator or ordinary user, even with a forged role claim', async () => {
      for (const role of ['user', 'admin'] as const) {
        const response = await app.inject({
          method: 'PATCH',
          url: `/users/${memberId}`,
          headers: headers(memberId, role),
          payload: { role: 'admin' },
        });
        expect(response.statusCode).toBe(403);
      }
      expect((await store.getById(memberId)).role).toBe('user');
      const [membership] =
        await db`SELECT role FROM company_memberships WHERE company_id=${company} AND user_id=${memberId}`;
      expect(membership!.role).toBe('admin');
    });
    it('grants and revokes the platform role, then denies the former admin token', async () => {
      const owner = headers(adminId, 'admin');
      const promoted = await app.inject({
        method: 'PATCH',
        url: `/users/${memberId}`,
        headers: owner,
        payload: { role: 'admin' },
      });
      expect(promoted.statusCode).toBe(200);
      expect(promoted.json().role).toBe('admin');
      expect(promoted.body).not.toContain('passwordHash');
      const memberPath = `/companies/${company}/members`;
      const promotedMember = (await app.inject({ url: memberPath, headers: owner }))
        .json()
        .members.find((member: { user_id: string }) => member.user_id === memberId);
      expect(promotedMember).toMatchObject({ role: 'admin', platform_role: 'admin' });
      const previousToken = headers(memberId, 'admin');
      expect((await app.inject({ url: '/users', headers: previousToken })).statusCode).toBe(200);
      expect(
        (
          await app.inject({
            method: 'PATCH',
            url: `/users/${memberId}`,
            headers: owner,
            payload: { role: 'user' },
          })
        ).statusCode,
      ).toBe(200);
      expect((await app.inject({ url: '/users', headers: previousToken })).statusCode).toBe(403);
      expect((await store.getById(memberId)).role).toBe('user');
      const revokedMember = (await app.inject({ url: memberPath, headers: owner }))
        .json()
        .members.find((member: { user_id: string }) => member.user_id === memberId);
      expect(revokedMember).toMatchObject({ role: 'admin', platform_role: 'user' });
    });
    it('denies removal of the last global administrator', async () => {
      const result = await app.inject({
        method: 'PATCH',
        url: `/users/${adminId}`,
        headers: headers(adminId, 'admin'),
        payload: { role: 'user' },
      });
      expect(result.statusCode).toBe(409);
      expect(result.json().code).toBe('last_admin');
      await expect(store.delete(adminId)).rejects.toMatchObject({ code: 'last_admin' });
    });
    it('keeps one admin when demotions and deletions compete', async () => {
      await store.update(memberId, { role: 'admin' });
      const outcomes = await Promise.allSettled([
        store.update(adminId, { role: 'user' }),
        store.delete(memberId),
      ]);
      expect(outcomes.filter((result) => result.status === 'rejected')).toHaveLength(1);
      expect(await store.countAdmins()).toBe(1);
    });
    it('does not restore a role or password from a concurrent name update', async () => {
      await store.update(memberId, { role: 'admin' });
      await Promise.all([
        store.update(memberId, { name: 'Updated manager' }),
        store.update(memberId, { role: 'user' }),
        store.setPasswordHash(memberId, 'new-synthetic-hash'),
      ]);
      expect(await store.getById(memberId)).toMatchObject({
        name: 'Updated manager',
        role: 'user',
        passwordHash: 'new-synthetic-hash',
      });
    });
    it('does not clear new restrictions when a name request read the old administrator role', async () => {
      await store.update(memberId, { role: 'admin' });
      const getById = app.userStore.getById.bind(app.userStore);
      let demoted = false;
      const read = vi.spyOn(app.userStore, 'getById').mockImplementation(async (id) => {
        const previous = await getById(id);
        if (id === memberId && !demoted) {
          demoted = true;
          await store.update(memberId, { role: 'user', allowedTools: ['vsl'] });
        }
        return previous;
      });
      try {
        const response = await app.inject({
          method: 'PATCH',
          url: `/users/${memberId}`,
          headers: headers(adminId, 'admin'),
          payload: { name: 'New name' },
        });
        expect(response.statusCode).toBe(200);
        expect(await store.getById(memberId)).toMatchObject({
          role: 'user',
          allowedTools: ['vsl'],
          name: 'New name',
        });
      } finally {
        read.mockRestore();
      }
    });
  },
);
