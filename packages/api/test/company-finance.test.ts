import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import Fastify from 'fastify';
import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { HttpProblem } from '../src/lib/problem.js';
import { companyRoutes } from '../src/routes/companies.js';
import { runFinanceSync } from '../src/services/company-finance.js';

describe.skipIf(!process.env.TASK_TEST_DATABASE_URL)(
  'company banking persistence and isolation',
  () => {
    const schema = `finance_${randomUUID().replaceAll('-', '')}`;
    let root: ReturnType<typeof postgres>;
    let db: ReturnType<typeof postgres>;
    const company = randomUUID();
    const other = randomUUID();
    const apiKey = 'synthetic-banking-key-not-a-real-key';
    const payload = { provider: 'wise', apiKey, profileId: '42', label: 'Wise test' };
    let connection: string;
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    function mockProvider(statementStatus = 200) {
      return vi.stubGlobal(
        'fetch',
        vi.fn(async (url: URL | string) => {
          const path = new URL(String(url)).pathname;
          if (path.endsWith('/profiles'))
            return json([{ id: 42, type: 'business', details: { name: 'Synthetic' } }]);
          if (path.endsWith('/balances'))
            return json([{ id: 1, type: 'STANDARD', amount: { value: 100, currency: 'USD' } }]);
          if (path.endsWith('/statement.json'))
            return json(
              {
                transactions: [
                  {
                    referenceNumber: 'TRANSFER-1',
                    date: '2026-10-01T00:00:00Z',
                    type: 'CREDIT',
                    amount: { value: 25, currency: 'USD' },
                  },
                ],
              },
              statementStatus,
            );
          throw Error('Unexpected provider URL');
        }),
      );
    }
    async function call(
      actor: string,
      method: 'GET' | 'POST' | 'DELETE',
      url: string,
      body?: unknown,
    ) {
      const app = Fastify();
      app.decorate('db', db);
      app.addHook('preHandler', async (req) => {
        req.user = { sub: actor, role: 'user', email: 'synthetic@example.test', iat: 0, exp: 0 };
      });
      app.setErrorHandler((error, _req, reply) =>
        reply
          .code(error instanceof HttpProblem ? error.status : 400)
          .send({ error: error.message }),
      );
      await app.register(companyRoutes);
      try {
        return await app.inject({ method, url, payload: body as Record<string, unknown> });
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
        throw Error('Isolated database required');
      root = postgres(url.toString(), { max: 1, onnotice: () => {} });
      await root.unsafe(`CREATE SCHEMA ${schema}`);
      db = postgres(url.toString(), {
        max: 4,
        connection: { search_path: schema },
        onnotice: () => {},
      });
      for (const file of ['109_company_memberships.sql', '113_company_finance.sql'])
        await db.unsafe(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
      await db`INSERT INTO companies(id,name,created_by) VALUES(${company},'Company A','owner'),(${other},'Company B','outsider')`;
      await db`INSERT INTO company_memberships(company_id,user_id,role) VALUES(${company},'owner','owner'),(${company},'member','member'),(${other},'outsider','owner')`;
    });
    afterEach(() => vi.unstubAllGlobals());
    afterAll(async () => {
      await db?.end();
      await root?.unsafe(`DROP SCHEMA ${schema} CASCADE`);
      await root?.end();
    });
    it('denies other companies and members before accessing providers', async () => {
      const fetch = vi.fn();
      vi.stubGlobal('fetch', fetch);
      for (const actor of ['outsider', 'member']) {
        expect((await call(actor, 'GET', `/companies/${company}/finance`)).statusCode).toBe(403);
        expect(
          (await call(actor, 'POST', `/companies/${company}/finance/connections`, payload))
            .statusCode,
        ).toBe(403);
      }
      expect(fetch).not.toHaveBeenCalled();
    });
    it('validates profiles, encrypts keys, never exposes credentials and keeps 90-day start', async () => {
      mockProvider();
      expect(
        (
          await call('owner', 'POST', `/companies/${company}/finance/connections`, {
            ...payload,
            profileId: '43',
          })
        ).statusCode,
      ).toBe(422);
      expect(
        (await call('owner', 'POST', `/companies/${company}/finance/connections`, payload))
          .statusCode,
      ).toBe(200);
      const [row] = await db`SELECT * FROM company_finance_connections WHERE company_id=${company}`;
      connection = row!.id;
      expect(row!.key_encrypted).not.toContain(apiKey);
      expect(Math.round((Date.now() - new Date(row!.history_start).getTime()) / 86400000)).toBe(90);
      const result = await call('owner', 'GET', `/companies/${company}/finance`);
      expect(result.statusCode).toBe(200);
      expect(result.headers['cache-control']).toContain('no-store');
      expect(result.body).not.toContain(apiKey);
      expect(result.body).not.toContain('key_encrypted');
      expect(
        (await call('outsider', 'POST', `/companies/${other}/finance/connections`, payload))
          .statusCode,
      ).toBe(409);
    });
    it('persists imports once and retries overlapping pages idempotently', async () => {
      mockProvider();
      await runFinanceSync(db);
      expect((await db`SELECT * FROM company_finance_entries`).length).toBe(1);
      await db`UPDATE company_finance_connections SET next_sync_at=now()`;
      await runFinanceSync(db);
      expect((await db`SELECT * FROM company_finance_entries`).length).toBe(1);
      const [row] = await db`SELECT history_cursor,status FROM company_finance_connections`;
      expect(row!.history_cursor).toBeTruthy();
      expect(row!.status).toBe('ready');
    });
    it('preserves cursor and saved balances on provider failure', async () => {
      const [before] = await db`SELECT history_cursor,balances FROM company_finance_connections`;
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => json({}, 401)),
      );
      await db`UPDATE company_finance_connections SET next_sync_at=now()`;
      await runFinanceSync(db);
      const [after] =
        await db`SELECT history_cursor,balances,status,error_code FROM company_finance_connections`;
      expect(after!.history_cursor).toEqual(before!.history_cursor);
      expect(after!.balances).toEqual(before!.balances);
      expect(after!.error_code).toBe('invalid_key');
      expect(after!.status).toBe('error');
    });
    it('supports Wise balance-only without claiming a historical import', async () => {
      mockProvider(403);
      await db`UPDATE company_finance_connections SET next_sync_at=now()`;
      await runFinanceSync(db);
      const [row] = await db`SELECT history_supported,status FROM company_finance_connections`;
      expect(row!.history_supported).toBe(false);
      expect(row!.status).toBe('balance_only');
    });
    it('does not run a second worker while another replica owns the lease', async () => {
      const fetch = vi.fn();
      vi.stubGlobal('fetch', fetch);
      await db`UPDATE company_finance_connections SET lease_id=${randomUUID()},lease_until=now()+interval '10 minutes',next_sync_at=now()`;
      await runFinanceSync(db);
      expect(fetch).not.toHaveBeenCalled();
      await db`UPDATE company_finance_connections SET lease_id=NULL,lease_until=NULL`;
    });
    it('replacing a key preserves history start and retries statement permission', async () => {
      mockProvider();
      const [before] =
        await db`SELECT history_start,history_cursor FROM company_finance_connections`;
      expect(
        (
          await call('owner', 'POST', `/companies/${company}/finance/connections`, {
            ...payload,
            apiKey: 'synthetic-replacement-banking-key',
          })
        ).statusCode,
      ).toBe(200);
      const [after] =
        await db`SELECT history_start,history_cursor,history_supported FROM company_finance_connections`;
      expect(after!.history_start).toEqual(before!.history_start);
      expect(after!.history_cursor).toEqual(before!.history_cursor);
      expect(after!.history_supported).toBeNull();
    });
    it('disconnects only the chosen tenant, erases its key and retains history', async () => {
      expect(
        (
          await call(
            'outsider',
            'DELETE',
            `/companies/${company}/finance/connections/${connection}`,
          )
        ).statusCode,
      ).toBe(403);
      expect(
        (await call('owner', 'DELETE', `/companies/${company}/finance/connections/${connection}`))
          .statusCode,
      ).toBe(200);
      const [row] = await db`SELECT key_encrypted,status FROM company_finance_connections`;
      expect(row!.key_encrypted).toBeNull();
      expect(row!.status).toBe('disconnected');
      const fetch = vi.fn();
      vi.stubGlobal('fetch', fetch);
      await runFinanceSync(db);
      expect(fetch).not.toHaveBeenCalled();
      expect((await db`SELECT * FROM company_finance_entries`).length).toBe(1);
    });
  },
);
