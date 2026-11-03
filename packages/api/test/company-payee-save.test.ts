import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import Fastify from 'fastify';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HttpProblem } from '../src/lib/problem.js';
import { companyRoutes } from '../src/routes/companies.js';
import { defaultCompensation } from '../src/services/company-compensation.js';

describe.skipIf(!process.env.TASK_TEST_DATABASE_URL)(
  'atomic collaborator financial settings',
  () => {
    const schema = `payee_${randomUUID().replaceAll('-', '')}`;
    const company = randomUUID();
    const otherCompany = randomUUID();
    const month = '2026-11';
    const path = `/companies/${company}/payees/member`;
    const pix = { type: 'email', value: 'payee@example.test' };
    const settings = {
      ...defaultCompensation,
      fixed_minor: 200000,
      enabled: true,
      model: 'upsell',
    };
    let root: ReturnType<typeof postgres>;
    let db: ReturnType<typeof postgres>;

    async function request(actor: string, method: 'GET' | 'PUT', url: string, payload?: unknown) {
      const app = Fastify();
      app.decorate('db', db);
      app.decorate('userStore', { maybeGetById: async (id: string) => ({ id, name: id }) });
      app.addHook('preHandler', async (req) => {
        req.user = {
          sub: actor,
          role: actor === 'global-admin' ? 'admin' : 'user',
          email: `${actor}@example.test`,
          iat: 0,
          exp: 0,
        };
      });
      app.setErrorHandler((error, _req, reply) =>
        reply
          .code(error instanceof HttpProblem ? error.status : 400)
          .send({ error: error.message }),
      );
      await app.register(companyRoutes);
      try {
        return await app.inject({ method, url, payload: payload as Record<string, unknown> });
      } finally {
        await app.close();
      }
    }

    async function savedState() {
      return {
        pix: await db`SELECT * FROM company_member_pix WHERE company_id=${company}`,
        settings: await db`SELECT * FROM company_member_compensation WHERE company_id=${company}`,
        audit: await db`SELECT * FROM company_access_audit WHERE company_id=${company} ORDER BY id`,
      };
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
      for (const migration of [
        '109_company_memberships.sql',
        '110_company_pix.sql',
        '112_company_compensation.sql',
      ]) {
        await db.unsafe(
          readFileSync(new URL(`../migrations/${migration}`, import.meta.url), 'utf8'),
        );
      }
      await db`INSERT INTO companies(id,name,created_by) VALUES(${company},'Example','owner'),(${otherCompany},'Other','outsider')`;
      await db`INSERT INTO company_memberships(company_id,user_id,role) VALUES
      (${company},'owner','owner'),(${company},'member','member'),
      (${otherCompany},'outsider','owner'),(${otherCompany},'member','member')`;
      await db`INSERT INTO company_offers(company_id,offer_id,owner_user_id) VALUES
      (${company},'offer','owner'),(${otherCompany},'other-offer','outsider')`;
      await db.unsafe(`
      CREATE TABLE tracking_projects(id text PRIMARY KEY,offer_id text NOT NULL);
      CREATE TABLE tracking_orders(id text PRIMARY KEY,project_id text NOT NULL,provider text NOT NULL,
        paid_at timestamptz,order_kind text,amount_minor bigint,currency text,
        vendepay_connection_id text,syzepay_connection_id text);
      CREATE TABLE tracking_upsell_operator_attempts(id text PRIMARY KEY,project_id text,
        view_only boolean,opened_at timestamptz);
      CREATE TABLE tracking_upsell_operator_credits(order_id text PRIMARY KEY,project_id text,
        operator_id text,attempt_id text);
      CREATE TABLE webhook_receipts(order_id text,connection_id text,state text,payload jsonb);
      CREATE TABLE syzepay_inbox_receipts(tracking_order_id text,connection_id text,state text,authenticity text);
      INSERT INTO tracking_projects VALUES('project','offer'),('other-project','other-offer');
      INSERT INTO tracking_orders VALUES
        ('approved','project','syzepay','2026-11-02T15:00:00Z','upsell',3000,'BRL',NULL,'gateway'),
        ('other-company','other-project','syzepay','2026-11-02T15:00:00Z','upsell',3000,'BRL',NULL,'gateway'),
        ('unverified','project','syzepay','2026-11-02T15:00:00Z','upsell',3000,'BRL',NULL,'gateway'),
        ('front','project','syzepay','2026-11-02T15:00:00Z','front',3000,'BRL',NULL,'gateway');
      INSERT INTO tracking_upsell_operator_attempts VALUES
        ('click','project',false,'2026-11-02T14:00:00Z'),('other-click','other-project',false,'2026-11-02T14:00:00Z');
      INSERT INTO tracking_upsell_operator_credits VALUES
        ('approved','project','member','click'),('other-company','other-project','member','other-click'),
        ('unverified','project','member','click'),('front','project','member','click');
      INSERT INTO syzepay_inbox_receipts VALUES
        ('approved','gateway','processed','signature_verified'),('approved','gateway','processed','signature_verified'),
        ('other-company','gateway','processed','signature_verified'),('front','gateway','processed','signature_verified');
    `);
    });

    afterAll(async () => {
      await db?.end();
      await root?.unsafe(`DROP SCHEMA ${schema} CASCADE`);
      await root?.end();
    });

    it('distinguishes an unconfigured month from explicitly saved zero remuneration', async () => {
      const initial = await request('owner', 'GET', `${path}/compensation/${month}`);
      expect(initial.statusCode).toBe(200);
      expect(initial.json()).toMatchObject({ configured: false, settings: defaultCompensation });
      const save = await request('owner', 'PUT', path, {
        pix: null,
        compensation: { month, settings: defaultCompensation },
      });
      expect(save.statusCode).toBe(200);
      expect(save.json()).toMatchObject({
        saved: true,
        compensation: {
          configured: true,
          settings: defaultCompensation,
          variable_minor: 0,
          total_minor: 0,
        },
      });
    });

    it('saves Pix and remuneration together and returns the company-scoped approved report', async () => {
      const result = await request('owner', 'PUT', path, {
        pix,
        compensation: { month, settings },
      });
      expect(result.statusCode).toBe(200);
      expect(result.headers['cache-control']).toContain('no-store');
      expect(result.json()).toEqual({
        saved: true,
        compensation: {
          configured: true,
          settings,
          upsells: 1,
          variable_minor: 1000,
          total_minor: 201000,
        },
      });
      const state = await savedState();
      expect(state.pix[0]!.key_encrypted).not.toContain(pix.value);
      expect(state.settings[0]!.settings).toEqual(settings);
      expect(JSON.stringify(state.audit)).not.toContain(pix.value);
      expect(state.audit.slice(-2).map((row) => row.action)).toEqual([
        'pix.updated',
        'compensation.updated',
      ]);
      const reload = await request('owner', 'GET', `${path}/compensation/${month}`);
      expect(reload.json()).toEqual(result.json().compensation);
    });

    it('preserves legacy Pix-only saves without replacing saved remuneration', async () => {
      expect((await request('owner', 'PUT', path, { pix: null })).json()).toEqual({ saved: true });
      expect((await savedState()).settings[0]!.settings).toEqual(settings);
      expect((await request('owner', 'PUT', path, { pix })).json()).toEqual({ saved: true });
    });

    it('does not turn a missing profit input into a zero or a confirmed total', async () => {
      const profit = {
        ...settings,
        model: 'profit',
        profit_minor: null,
        percent_basis_points: 1000,
      };
      const result = await request('owner', 'PUT', path, {
        pix,
        compensation: { month: '2026-12', settings: profit },
      });
      expect(result.statusCode).toBe(200);
      expect(result.json().compensation).toMatchObject({
        configured: true,
        variable_minor: null,
        total_minor: null,
      });
    });

    it('rejects invalid/missing inputs before changing either record or audit', async () => {
      const before = await savedState();
      for (const invalid of [
        { pix, compensation: { month, settings: { ...settings, fixed_minor: -1 } } },
        { pix, compensation: { month: '2026-13', settings } },
        { pix, compensation: { month } },
        { compensation: { month, settings } },
        { pix: { type: 'cpf', value: 'invalid' }, compensation: { month, settings } },
      ]) {
        expect((await request('owner', 'PUT', path, invalid)).statusCode).toBe(400);
        expect(await savedState()).toEqual(before);
      }
    });

    it('denies other-company/member writes and missing recipients without any changes', async () => {
      const before = await savedState();
      const input = { pix, compensation: { month, settings } };
      expect((await request('outsider', 'PUT', path, input)).statusCode).toBe(403);
      expect((await request('member', 'PUT', path, input)).statusCode).toBe(403);
      expect((await request('global-admin', 'PUT', path, input)).statusCode).toBe(403);
      expect(
        (await request('owner', 'PUT', `/companies/${company}/payees/outsider`, input)).statusCode,
      ).toBe(404);
      expect((await request('outsider', 'GET', `${path}/compensation/${month}`)).statusCode).toBe(
        403,
      );
      expect(await savedState()).toEqual(before);
    });

    it('rolls back Pix, remuneration and audits if the report cannot be calculated', async () => {
      const before = await savedState();
      await db`ALTER TABLE tracking_orders RENAME TO unavailable_tracking_orders`;
      try {
        const result = await request('owner', 'PUT', path, {
          pix: { type: 'email', value: 'changed@example.test' },
          compensation: { month, settings: { ...settings, fixed_minor: 900000 } },
        });
        expect(result.statusCode).toBeGreaterThanOrEqual(400);
        expect(await savedState()).toEqual(before);
      } finally {
        await db`ALTER TABLE unavailable_tracking_orders RENAME TO tracking_orders`;
      }
    });

    it('keeps the original remuneration-only endpoint and isolates updates by month', async () => {
      const manual = { ...defaultCompensation, enabled: true, manual_minor: 5000 };
      const result = await request('owner', 'PUT', `${path}/compensation/2027-01`, manual);
      expect(result.statusCode).toBe(200);
      expect(result.json()).toMatchObject({ saved: true });
      const report = await request('owner', 'GET', `${path}/compensation/2027-01`);
      expect(report.json()).toMatchObject({
        configured: true,
        settings: manual,
        variable_minor: 5000,
        total_minor: 5000,
      });
      expect(
        (await request('owner', 'GET', `${path}/compensation/${month}`)).json().settings,
      ).toEqual(settings);
    });
  },
);
