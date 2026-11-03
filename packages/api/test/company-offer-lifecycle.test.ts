import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import Fastify from 'fastify';
import type { Redis } from 'ioredis';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { HttpProblem } from '../src/lib/problem.js';
import { companyRoutes } from '../src/routes/companies.js';
import { registerGetOffersRoutes } from '../src/routes/offers/get-offers.js';
import { OfferStore } from '../src/services/offer-store.js';

class MemoryRedis {
  hashes = new Map<string, Record<string, string>>();
  sets = new Map<string, Set<string>>();
  failWrite = false;
  failRead = false;
  async hgetall(key: string) {
    if (this.failRead) throw Error('Redis unavailable');
    return this.hashes.get(key) ?? {};
  }
  async smembers(key: string) {
    return [...(this.sets.get(key) ?? [])];
  }
  async scan() {
    return ['0', [...this.hashes.keys()]];
  }
  pipeline() {
    const ops: Array<() => unknown> = [];
    const tx = {
      hgetall: (key: string) => {
        ops.push(() => this.hgetall(key));
        return tx;
      },
      hset: (key: string, data: Record<string, string>) => {
        ops.push(() => {
          this.hashes.set(key, data);
          return 1;
        });
        return tx;
      },
      sadd: (key: string, value: string) => {
        ops.push(() => {
          const set = this.sets.get(key) ?? new Set<string>();
          set.add(value);
          this.sets.set(key, set);
          return 1;
        });
        return tx;
      },
      srem: (key: string, value: string) => {
        ops.push(() => {
          this.sets.get(key)?.delete(value);
          return 1;
        });
        return tx;
      },
      del: (key: string) => {
        ops.push(() => this.hashes.delete(key));
        return tx;
      },
      exec: async () => Promise.all(ops.map(async (operation) => [null, await operation()])),
    };
    return tx;
  }
  multi() {
    const tx = this.pipeline();
    const execute = tx.exec;
    tx.exec = async () => {
      if (this.failWrite) throw Error('Redis write unavailable');
      return execute();
    };
    return tx;
  }
}

describe.skipIf(!process.env.TASK_TEST_DATABASE_URL)('company offer lifecycle', () => {
  const schema = `company_lifecycle_${randomUUID().replaceAll('-', '')}`;
  const company = randomUUID();
  const second = randomUUID();
  let root: ReturnType<typeof postgres>;
  let db: ReturnType<typeof postgres>;
  let redis: MemoryRedis;
  let store: OfferStore;
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
    await db`INSERT INTO companies(id,name,created_by) VALUES(${company},'Company A','owner'),(${second},'Company B','owner')`;
    await db`INSERT INTO company_memberships(company_id,user_id,role,tools) VALUES
      (${company},'owner','owner',ARRAY['ofertas']),(${second},'owner','owner',ARRAY['ofertas']),
      (${company},'manager','admin',ARRAY['ofertas']),(${company},'member','member',ARRAY['ofertas'])`;
    redis = new MemoryRedis();
    store = new OfferStore(redis as unknown as Redis, 'synthetic-only', db);
  });
  afterAll(async () => {
    await db?.end();
    await root?.unsafe(`DROP SCHEMA ${schema} CASCADE`);
    await root?.end();
  });
  async function request(
    actor: string,
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    payload?: unknown,
  ) {
    const app = Fastify();
    app.decorate('db', db);
    app.decorate('offerStore', store);
    app.decorate('snapshotStore', { deleteAllForOffer: vi.fn() });
    app.decorate('intradayStore', { deleteAllForOffer: vi.fn() });
    app.addHook('preHandler', async (req) => {
      req.user = {
        sub: actor,
        role: actor === 'global' ? 'admin' : 'user',
        email: `${actor}@example.test`,
        iat: 0,
        exp: 0,
      };
    });
    app.setErrorHandler((error, _req, reply) =>
      reply.code(error instanceof HttpProblem ? error.status : 500).send({ error: error.message }),
    );
    await app.register(companyRoutes);
    registerGetOffersRoutes(app);
    try {
      return await app.inject({ method, url, payload: payload as Record<string, unknown> });
    } finally {
      await app.close();
    }
  }
  const create = (actor: string, companyId?: string) =>
    request(actor, 'POST', '/offers', {
      name: randomUUID(),
      company_name: 'Untrusted label',
      ...(companyId ? { company_id: companyId } : {}),
      utmify_access_enabled: false,
    });

  it('owner with two companies explicitly chooses the binding, never by label', async () => {
    const response = await create('owner', second);
    expect(response.statusCode).toBe(201);
    expect(response.json().company_name).toBe('Company B');
    const [binding] = await db`SELECT * FROM company_offers WHERE offer_id=${response.json().id}`;
    expect(binding.company_id).toBe(second);
    expect(
      (await request('owner', 'GET', `/companies/${second}/offers`)).json().offers,
    ).toContainEqual({ id: response.json().id, name: response.json().name });
    const access = await store.permissions(await store.get(response.json().id), 'manager');
    expect(access).toEqual({ read: false, manage: false });
  });
  it('company admin creates; member, outsiders, suspended users and missing scope are denied', async () => {
    expect((await create('manager', company)).statusCode).toBe(201);
    expect((await create('member', company)).statusCode).toBe(403);
    expect((await create('outsider', company)).statusCode).toBe(403);
    expect((await create('manager', second)).statusCode).toBe(403);
    for (const actor of ['owner', 'member', 'outsider', 'global'])
      expect((await create(actor)).statusCode).toBe(403);
    await db`UPDATE company_memberships SET status='suspended' WHERE company_id=${company} AND user_id='manager'`;
    expect((await create('manager', company)).statusCode).toBe(403);
    await db`UPDATE company_memberships SET status='active' WHERE company_id=${company} AND user_id='manager'`;
  });
  it('global access is explicit; a missing company cannot create a Redis offer', async () => {
    const response = await create('global', company);
    expect(response.statusCode).toBe(201);
    expect(
      (await db`SELECT company_id FROM company_offers WHERE offer_id=${response.json().id}`)[0]
        .company_id,
    ).toBe(company);
    const size = redis.hashes.size;
    expect((await create('global', randomUUID())).statusCode).toBe(404);
    expect(redis.hashes.size).toBe(size);
  });
  it('an active company admin can update even after the original owner is suspended', async () => {
    const response = await create('owner', company);
    await db`UPDATE company_memberships SET status='suspended' WHERE company_id=${company} AND user_id='owner'`;
    try {
      const updated = await request('manager', 'PATCH', `/offers/${response.json().id}`, {
        status: 'pausado',
        company_name: 'Another company',
      });
      expect(updated.statusCode).toBe(200);
      expect(updated.json().company_name).toBe('Company A');
      expect(
        (await request('owner', 'PATCH', `/offers/${response.json().id}`, { status: 'escala' }))
          .statusCode,
      ).toBe(404);
    } finally {
      await db`UPDATE company_memberships SET status='active' WHERE company_id=${company} AND user_id='owner'`;
    }
  });
  it('delete removes the binding/grants and leaves commercial orders untouched', async () => {
    const response = await create('owner', company);
    const id = response.json().id;
    await db`CREATE TABLE IF NOT EXISTS orders(id text PRIMARY KEY,offer_id text,status text)`;
    await db`INSERT INTO orders VALUES(${id},${id},'approved')`;
    await db`INSERT INTO company_offer_grants(company_id,user_id,offer_id) VALUES(${company},'member',${id})`;
    expect((await request('member', 'DELETE', `/offers/${id}`)).statusCode).toBe(404);
    expect((await request('manager', 'DELETE', `/offers/${id}`)).statusCode).toBe(204);
    expect(await db`SELECT * FROM company_offers WHERE offer_id=${id}`).toHaveLength(0);
    expect(await db`SELECT * FROM company_offer_grants WHERE offer_id=${id}`).toHaveLength(0);
    expect(await db`SELECT * FROM orders WHERE id=${id}`).toHaveLength(1);
    expect((await request('owner', 'GET', `/companies/${company}/offers`)).statusCode).toBe(200);
  });
  it('a failed Redis delete retains the boundary and never grants legacy access', async () => {
    const response = await create('global', company);
    const id = response.json().id;
    redis.failWrite = true;
    try {
      expect((await request('manager', 'DELETE', `/offers/${id}`)).statusCode).toBe(500);
    } finally {
      redis.failWrite = false;
    }
    expect(await db`SELECT * FROM company_offers WHERE offer_id=${id}`).toHaveLength(1);
    expect((await store.permissions(await store.get(id), 'global')).read).toBe(false);
  });
  it('failed Redis creation leaves only a safe hidden binding; stale bindings do not break selectors', async () => {
    const size = redis.hashes.size;
    redis.failWrite = true;
    try {
      expect((await create('owner', company)).statusCode).toBe(500);
    } finally {
      redis.failWrite = false;
    }
    expect(redis.hashes.size).toBe(size);
    expect((await request('owner', 'GET', `/companies/${company}/offers`)).statusCode).toBe(200);
    redis.failRead = true;
    try {
      expect((await request('owner', 'GET', `/companies/${company}/offers`)).statusCode).toBe(500);
    } finally {
      redis.failRead = false;
    }
  });
  it('SQL authorization failure prevents creation and access instead of legacy fallback', async () => {
    const broken = Object.assign(() => Promise.reject(Error('SQL unavailable')), {
      begin: () => Promise.reject(Error('SQL unavailable')),
    }) as unknown as ReturnType<typeof postgres>;
    const isolated = new OfferStore(redis as unknown as Redis, 'synthetic-only', broken);
    const size = redis.hashes.size;
    await expect(
      isolated.create({ userId: 'owner', name: randomUUID(), companyId: company }),
    ).rejects.toThrow('SQL unavailable');
    expect(redis.hashes.size).toBe(size);
    await expect(
      isolated.permissions(
        {
          id: 'legacy',
          userId: 'owner',
          name: 'Legacy',
          status: 'testando',
          createdAt: new Date().toISOString(),
        },
        'owner',
      ),
    ).rejects.toThrow('SQL unavailable');
  });
});
