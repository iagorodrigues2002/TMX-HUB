import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import Fastify from 'fastify';
import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createResilientPostgresClient } from '../src/lib/postgres-retry.js';
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
    function mockProvider(statementStatus = 200, transactionDate = '2026-10-01T00:00:00Z') {
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
                    date: transactionDate,
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
      method: 'GET' | 'POST' | 'DELETE' | 'PUT',
      url: string,
      body?: unknown,
    ) {
      const app = Fastify();
      app.decorate('db', createResilientPostgresClient(db));
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
      for (const file of [
        '109_company_memberships.sql',
        '113_company_finance.sql',
        '115_finance_classification.sql',
        '116_finance_card_ledger.sql',
        '117_finance_notifications.sql',
      ])
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
    it('never notifies historical imports and deduplicates newly settled movements', async () => {
      expect((await db`SELECT * FROM company_finance_notifications`).length).toBe(0);
      const at = new Date(Date.now() - 1000).toISOString();
      mockProvider(200, at);
      await db`UPDATE company_finance_connections SET notification_ready_at=now()-interval '1 minute',history_cursor=now(),next_sync_at=now()`;
      await runFinanceSync(db);
      expect((await db`SELECT * FROM company_finance_notifications`).length).toBe(1);
      await db`UPDATE company_finance_connections SET next_sync_at=now()`;
      await runFinanceSync(db);
      expect((await db`SELECT * FROM company_finance_notifications`).length).toBe(1);
      await db`DELETE FROM company_finance_notifications`;
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
    it('schedules a one-time LootRush repair without deleting history or manual categories', async () => {
      const id = randomUUID();
      await db`INSERT INTO company_finance_connections(id,company_id,provider,profile_id,label,key_encrypted,history_start,history_cursor)
        VALUES(${id},${company},'lootrush','synthetic-loot-repair','Synthetic','not-a-real-key','2026-08-05','2026-11-03')`;
      await db`INSERT INTO company_finance_entries(company_id,connection_id,external_id,operation_id,occurred_at,kind,status,description,sent,sent_currency,category_override)
        VALUES(${company},${id},'repair','repair','2026-10-01','unknown','unknown','Preserve manual',5,'USD','fixed')`;
      await db.unsafe(
        readFileSync(new URL('../migrations/116_finance_card_ledger.sql', import.meta.url), 'utf8'),
      );
      const [row] =
        await db`SELECT history_cursor,history_start,key_encrypted FROM company_finance_connections WHERE id=${id}`;
      expect(row!.history_cursor).toBeNull();
      expect(row!.key_encrypted).toBe('not-a-real-key');
      expect(
        (
          await db`SELECT category_override FROM company_finance_entries WHERE connection_id=${id}`
        )[0]!.category_override,
      ).toBe('fixed');
      await db`DELETE FROM company_finance_connections WHERE id=${id}`;
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
    it('counts settled card purchases once without prepaid topups or declined charges', async () => {
      const base = `/companies/${company}/finance`;
      for (const [id, kind, status, amount] of [
        ['topup', 'card_topup', 'settled', 100],
        ['charge', 'card_charge', 'settled', 25],
        ['declined-card', 'card_charge', 'declined', 30],
        ['hold-card', 'card_charge', 'on_hold', 40],
      ] as const)
        await db`INSERT INTO company_finance_entries(company_id,connection_id,external_id,operation_id,occurred_at,kind,status,description,sent,sent_currency)
          VALUES(${company},${connection},${id},${id},'2019-10-02T12:00:00Z',${kind},${status},${id},${amount},'USD')`;
      const days = (await call('owner', 'GET', `${base}/analytics?month=2019-10`)).json().days;
      expect(days.find((d: { currency: string }) => d.currency === 'USD')).toMatchObject({
        outgoing: '25',
        variable: '25',
        transactions: 1,
      });
      expect(
        (
          await call('owner', 'PUT', `${base}/classification`, {
            connectionId: connection,
            externalId: 'topup',
            category: 'variable',
          })
        ).statusCode,
      ).not.toBe(200);
      const expenses = (await call('owner', 'GET', `${base}?view=outgoing`)).json().entries;
      expect(expenses.map((r: { external_id: string }) => r.external_id)).toEqual(['charge']);
      await db`DELETE FROM company_finance_entries WHERE external_id IN ('topup','charge','declined-card','hold-card')`;
    });
    it('classifies scoped history, aggregates beyond pagination and preserves currencies and local dates', async () => {
      const rules = {
        vendepayIncome: true,
        withdrawalRecipient: '52.210.584 IAGO RODRIGUES DA COSTA',
      };
      const base = `/companies/${company}/finance`;
      expect((await call('outsider', 'PUT', `${base}/rules`, rules)).statusCode).toBe(403);
      expect((await call('member', 'GET', `${base}/analytics?month=2020-10`)).statusCode).toBe(403);
      expect((await call('owner', 'PUT', `${base}/rules`, rules)).statusCode).toBe(200);
      for (let i = 0; i < 55; i++)
        await db`INSERT INTO company_finance_entries(company_id,connection_id,external_id,operation_id,occurred_at,kind,status,description,received,received_currency)
        VALUES(${company},${connection},${`qa-${i}`},${`qa-${i}`},'2020-10-02T02:00:00Z','CREDIT','completed','VendePay Technologies',10,'USD')`;
      await db`INSERT INTO company_finance_entries(company_id,connection_id,external_id,operation_id,occurred_at,kind,status,description,sent,sent_currency)
        VALUES(${company},${connection},'withdraw','withdraw','2020-10-02T03:00:00Z','DEBIT','completed','52.210.584 IAGO RODRIGUES DA COSTA',20,'USD'),
        (${company},${connection},'fixed','fixed','2020-10-02T03:00:00Z','DEBIT','completed','Hosting',30,'USD'),
        (${company},${connection},'pending','pending','2020-10-02T03:00:00Z','DEBIT','pending','Pending',100,'USD')`;
      const classification = { connectionId: connection, externalId: 'fixed', category: 'fixed' };
      expect(
        (await call('outsider', 'PUT', `${base}/classification`, classification)).statusCode,
      ).toBe(403);
      expect(
        (
          await call('owner', 'PUT', `${base}/classification`, {
            ...classification,
            category: 'income',
          })
        ).statusCode,
      ).toBe(422);
      expect(
        (await call('owner', 'PUT', `${base}/classification`, classification)).statusCode,
      ).toBe(200);
      const result = await call('owner', 'GET', `${base}/analytics?month=2020-10`);
      expect(result.statusCode).toBe(200);
      const days = result.json().days as { day: string; currency: string | null }[];
      expect(days.find((d) => d.day === '2020-10-01' && d.currency === 'USD')).toMatchObject({
        incoming: '550',
        transactions: 55,
      });
      expect(days.find((d) => d.day === '2020-10-02' && d.currency === 'USD')).toMatchObject({
        outgoing: '50',
        fixed: '30',
        withdrawals: '20',
      });
      expect(days.find((d) => d.currency === null)).toMatchObject({ excluded: 1 });
      expect(
        (await call('owner', 'GET', `${base}/analytics?month=2020-10&provider=lootrush`)).json()
          .days,
      ).toEqual([]);
      expect((await call('owner', 'GET', `${base}/analytics?month=2020-99`)).statusCode).toBe(400);
      const withdrawals = (await call('owner', 'GET', `${base}?view=withdrawals`)).json().entries;
      expect(withdrawals.map((r: { external_id: string }) => r.external_id)).toEqual(['withdraw']);
      const expenses = (await call('owner', 'GET', `${base}?view=outgoing`)).json().entries;
      expect(expenses.map((r: { external_id: string }) => r.external_id)).toEqual(['fixed']);
      expect(expenses[0].category_override).toBe('fixed');
      expect(
        (
          await call('outsider', 'GET', `/companies/${other}/finance/analytics?month=2020-10`)
        ).json().days,
      ).toEqual([]);
    });
  },
);
