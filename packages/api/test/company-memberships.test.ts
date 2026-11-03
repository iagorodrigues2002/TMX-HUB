import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import Fastify from 'fastify';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HttpProblem } from '../src/lib/problem.js';
import { companyRoutes } from '../src/routes/companies.js';

describe.skipIf(!process.env.TASK_TEST_DATABASE_URL)('persistent company authorization', () => {
  const schema = `company_${randomUUID().replaceAll('-', '')}`;
  let root: ReturnType<typeof postgres>;
  let db: ReturnType<typeof postgres>;
  let company: string;
  let second: string;
  const users = ['owner', 'owner2', 'member', 'manager', 'global-admin'];
  const access = (role = 'member') => ({
    role,
    status: 'active',
    tools: ['ofertas'],
    all_offers: false,
    offer_ids: [],
  });
  async function request(
    actor: string,
    method: 'GET' | 'POST' | 'PUT',
    url: string,
    payload?: unknown,
  ) {
    const app = Fastify();
    app.decorate('db', db);
    app.decorate('userStore', {
      maybeGetById: async (id: string) =>
        users.includes(id)
          ? {
              id,
              name: id,
              email: `${id}@example.test`,
              role: id === 'global-admin' ? 'admin' : 'user',
            }
          : null,
      getByEmail: async (email: string) => {
        const id = email.split('@')[0]!;
        return users.includes(id) ? { id } : null;
      },
    });
    app.decorate('offerStore', {
      get: async (id: string) => ({ id, name: id, userId: id === 'offer2' ? 'owner2' : 'owner' }),
    });
    app.addHook('preHandler', async (req) => {
      req.user = { sub: actor, role: 'user', email: `${actor}@example.test`, iat: 0, exp: 0 };
    });
    app.setErrorHandler((error, _req, reply) =>
      reply.code(error instanceof HttpProblem ? error.status : 400).send({ error: error.message }),
    );
    await app.register(companyRoutes);
    try {
      return await app.inject({ method, url, payload: payload as Record<string, unknown> });
    } finally {
      await app.close();
    }
  }
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
      max: 5,
      connection: { search_path: schema },
      onnotice: () => {},
    });
    await db.unsafe(
      readFileSync(new URL('../migrations/109_company_memberships.sql', import.meta.url), 'utf8'),
    );
    await db.unsafe(
      readFileSync(new URL('../migrations/110_company_pix.sql', import.meta.url), 'utf8'),
    );
    company = (await request('owner', 'POST', '/companies', { name: 'TMX' })).json().company.id;
    second = (await request('owner2', 'POST', '/companies', { name: 'TMX' })).json().company.id;
  });
  afterAll(async () => {
    await db?.end();
    await root?.unsafe(`DROP SCHEMA ${schema} CASCADE`);
    await root?.end();
  });
  it('identical labels never merge tenants and outsider cannot enumerate members', async () => {
    expect(company).not.toBe(second);
    const list = (await request('owner', 'GET', '/companies')).json().companies;
    expect(list.map((c: { id: string }) => c.id)).toEqual([company]);
    expect((await request('owner2', 'GET', `/companies/${company}/members`)).statusCode).toBe(403);
  });
  it('one login can manage two companies without merging their members', async () => {
    await db`INSERT INTO company_memberships(company_id,user_id,role,tools) VALUES(${second},'owner','owner','{}')`;
    try {
      const list = (await request('owner', 'GET', '/companies')).json().companies;
      expect(list.map((c: { id: string }) => c.id).sort()).toEqual([company, second].sort());
      expect((await request('owner', 'GET', `/companies/${second}/members`)).statusCode).toBe(200);
      expect((await request('owner2', 'GET', `/companies/${company}/members`)).statusCode).toBe(
        403,
      );
    } finally {
      await db`DELETE FROM company_memberships WHERE company_id=${second} AND user_id='owner'`;
    }
    expect((await request('owner', 'GET', `/companies/${second}/members`)).statusCode).toBe(403);
  });
  it('stores Pix encrypted, denies other tenants and supports removal without leaking audit values', async () => {
    const path = `/companies/${company}/payees/owner`;
    const pix = { type: 'email', value: 'synthetic@example.test' };
    expect((await request('owner2', 'PUT', path, { pix })).statusCode).toBe(403);
    expect((await request('member', 'GET', `/companies/${company}/payees`)).statusCode).toBe(403);
    expect(
      (await request('owner', 'PUT', path, { pix: { type: 'cpf', value: 'bad' } })).statusCode,
    ).toBe(400);
    expect(
      (await request('owner', 'PUT', `/companies/${company}/payees/owner2`, { pix })).statusCode,
    ).toBe(404);
    expect((await request('owner', 'PUT', path, { pix })).statusCode).toBe(200);
    const [stored] =
      await db`SELECT key_encrypted FROM company_member_pix WHERE company_id=${company}`;
    expect(stored!.key_encrypted).not.toContain(pix.value);
    const response = await request('owner', 'GET', `/companies/${company}/payees`);
    expect(response.headers['cache-control']).toContain('no-store');
    expect(
      response.json().payees.find((p: { user_id: string }) => p.user_id === 'owner').pix,
    ).toEqual(pix);
    const audit = await db`SELECT * FROM company_access_audit WHERE company_id=${company}`;
    expect(JSON.stringify(audit)).not.toContain(pix.value);
    expect((await request('owner', 'PUT', path, { pix: null })).statusCode).toBe(200);
    expect((await db`SELECT * FROM company_member_pix WHERE company_id=${company}`).length).toBe(0);
  });
  it('persists members across requests and grants only offers in the tenant', async () => {
    expect(
      (await request('owner', 'POST', `/companies/${company}/offers`, { offer_id: 'offer1' }))
        .statusCode,
    ).toBe(201);
    expect(
      (await request('owner', 'POST', `/companies/${company}/offers`, { offer_id: 'offer2' }))
        .statusCode,
    ).toBe(403);
    expect(
      (
        await request('owner', 'PUT', `/companies/${company}/members/member`, {
          ...access(),
          offer_ids: ['offer2'],
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await request('owner', 'PUT', `/companies/${company}/members/member`, {
          ...access(),
          offer_ids: ['offer1'],
        })
      ).statusCode,
    ).toBe(200);
    const member = (await request('owner', 'GET', `/companies/${company}/members`))
      .json()
      .members.find((m: { user_id: string }) => m.user_id === 'member');
    expect(member.offer_ids).toEqual(['offer1']);
    expect((await request('member', 'GET', `/companies/${company}/members`)).statusCode).toBe(403);
    expect((await request('member', 'POST', '/companies', { name: 'Escalada' })).statusCode).toBe(
      403,
    );
  });
  it('company admin cannot promote self, another admin or an owner', async () => {
    await request('owner', 'PUT', `/companies/${company}/members/manager`, access('admin'));
    expect((await request('manager', 'POST', '/companies', { name: 'Escalada' })).statusCode).toBe(
      403,
    );
    expect(
      (await request('manager', 'PUT', `/companies/${company}/members/manager`, access('owner')))
        .statusCode,
    ).toBe(403);
    expect(
      (await request('manager', 'PUT', `/companies/${company}/members/member`, access('admin')))
        .statusCode,
    ).toBe(403);
    expect(
      (await request('manager', 'PUT', `/companies/${company}/members/owner`, access())).statusCode,
    ).toBe(403);
    expect(
      (
        await request('manager', 'PUT', `/companies/${company}/members/member`, {
          ...access(),
          status: 'suspended',
        })
      ).statusCode,
    ).toBe(200);
    expect((await request('member', 'GET', '/companies')).json().companies).toEqual([]);
  });
  it('reports the global role separately from the company role', async () => {
    await request('owner', 'PUT', `/companies/${company}/members/global-admin`, access('admin'));
    const response = await request('owner', 'GET', `/companies/${company}/members`);
    const members = response.json().members;
    expect(members.find((m: { user_id: string }) => m.user_id === 'global-admin')).toMatchObject({
      role: 'admin',
      platform_role: 'admin',
    });
    expect(members.find((m: { user_id: string }) => m.user_id === 'manager')).toMatchObject({
      role: 'admin',
      platform_role: 'user',
    });
    expect(response.body).not.toContain('passwordHash');
  });
  it('rejects forged global privileges and unsupported tools without changing membership', async () => {
    expect(
      (
        await request('owner', 'PUT', `/companies/${company}/members/member`, {
          ...access(),
          global_admin: true,
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await request('owner', 'PUT', `/companies/${company}/members/member`, {
          ...access(),
          tools: ['admin'],
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await request('member', 'PUT', `/companies/${company}/members/member`, access('owner')))
        .statusCode,
    ).toBe(403);
    const [row] =
      await db`SELECT role,status FROM company_memberships WHERE company_id=${company} AND user_id='member'`;
    expect(row).toMatchObject({ role: 'member', status: 'suspended' });
  });
  it('cannot suspend last owner; concurrent owner removals keep one active', async () => {
    expect(
      (
        await request('owner', 'PUT', `/companies/${company}/members/owner`, {
          ...access('owner'),
          status: 'suspended',
        })
      ).statusCode,
    ).toBe(409);
    await request('owner', 'PUT', `/companies/${company}/members/manager`, access('owner'));
    const results = await Promise.all([
      request('owner', 'PUT', `/companies/${company}/members/owner`, access()),
      request('manager', 'PUT', `/companies/${company}/members/manager`, access()),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    const [row] =
      await db`SELECT count(*)::int n FROM company_memberships WHERE company_id=${company} AND role='owner' AND status='active'`;
    expect(row!.n).toBe(1);
  });
});
