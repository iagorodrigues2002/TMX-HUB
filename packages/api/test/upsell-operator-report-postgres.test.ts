import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import errorHandlerPlugin from '../src/plugins/error-handler.js';
import { registerUpsellOperatorAudit } from '../src/routes/upsell-operator-audit.js';

// Requires migrations on a disposable local database; no DATABASE_URL fallback.
const url = process.env.ATTRIBUTION_REPORT_TEST_DATABASE_URL;
describe.skipIf(!url)('operator report end-to-end (local PostgreSQL)', () => {
  const db = postgres(url ?? 'postgres://unused', { max: 1 });
  const id = `report-test-${randomUUID()}`;
  const second = `${id}-second`;
  beforeAll(async () => {
    await db`INSERT INTO tracking_projects(id,offer_id,public_key) VALUES(${id},${id},${id})`;
    await db`INSERT INTO vendepay_connections(id,project_id,token_hash) VALUES(${id},${id},${id})`;
    await db`INSERT INTO tracking_orders(id,project_id,provider,external_id,status,order_kind,paid_at,occurred_at,visitor_id,vendepay_connection_id)
      VALUES(${`${id}-front`},${id},'vendepay',${`${id}-front`},'paid','front',now()-interval '30 minutes',now()-interval '30 minutes',${id},${id})`;
    for (const [operator, minutes] of [
      ['first', 20],
      ['winner', 10],
    ] as const)
      await db`INSERT INTO tracking_upsell_operator_attempts(id,project_id,order_id,stage_id,stage_key,provider,operator_id,click_id,opened_at)
        VALUES(${id + operator},${id},${`${id}-front`},'s','upsell_1','vendepay',${operator},${id + operator},now()-${minutes}*interval '1 minute')`;
    await db`INSERT INTO tracking_orders(id,project_id,provider,external_id,status,order_kind,paid_at,occurred_at,visitor_id,vendepay_connection_id,amount_minor,amount_brl_minor,currency)
      VALUES(${`${id}-upsell`},${id},'vendepay',${`${id}-upsell`},'paid','upsell',now(),now(),${id},${id},2500,13000,'USD')`;
    await db`INSERT INTO webhook_receipts(id,connection_id,dedupe_key,payload,state,order_id)
      VALUES(${id},${id},${id},${db.json({ transaction_id: `${id}-upsell`, status: 'paid' })},'processed',${`${id}-upsell`})`;
    await db`INSERT INTO tracking_projects(id,offer_id,public_key) VALUES(${second},${second},${second})`;
    await db`INSERT INTO vendepay_connections(id,project_id,token_hash) VALUES(${second},${second},${second})`;
    await db`INSERT INTO tracking_orders(id,project_id,provider,external_id,status,order_kind,paid_at,occurred_at,visitor_id,vendepay_connection_id)
      VALUES(${`${second}-front`},${second},'vendepay',${`${second}-front`},'paid','front','2026-10-15 02:30Z','2026-10-15 02:30Z',${second},${second})`;
    for (const [stage, clickAt, paidAt, amount] of [
      ['upsell_1', '2026-10-16 02:59:59.999Z', '2026-10-16 03:30Z', 13000],
      ['upsell_2', '2026-10-16 03:00Z', '2026-10-16 04:00Z', 5000],
    ] as const) {
      const key = second + stage;
      if (stage === 'upsell_2')
        await db`INSERT INTO tracking_upsell_operator_attempts(id,project_id,order_id,stage_id,stage_key,provider,operator_id,click_id,opened_at)
        VALUES(${`${key}-earlier`},${second},${`${second}-front`},'s',${stage},'vendepay','first',${`${key}-earlier`},'2026-10-16 02:59:58Z')`;
      await db`INSERT INTO tracking_upsell_operator_attempts(id,project_id,order_id,stage_id,stage_key,provider,operator_id,click_id,opened_at)
        VALUES(${key},${second},${`${second}-front`},'s',${stage},'vendepay','winner',${key},${clickAt})`;
      await db`INSERT INTO tracking_orders(id,project_id,provider,external_id,status,order_kind,paid_at,occurred_at,visitor_id,vendepay_connection_id,amount_minor,amount_brl_minor,currency)
        VALUES(${key},${second},'vendepay',${key},'paid',${stage === 'upsell_1' ? 'upsell' : stage},${paidAt},${paidAt},${second},${second},${amount},${amount},'BRL')`;
      await db`INSERT INTO webhook_receipts(id,connection_id,dedupe_key,payload,state,order_id)
        VALUES(${key},${second},${key},${db.json({ transaction_id: key, status: 'paid' })},'processed',${key})`;
    }
  });
  afterAll(async () => {
    await db`DELETE FROM tracking_projects WHERE id=ANY(${[id, second]})`;
    await db.end();
  });
  const report = async (
    user: string,
    admin: boolean,
    options: { global?: boolean; from?: string; to?: string; offer?: string; status?: number } = {},
  ) => {
    const app = Fastify();
    app.decorate('db', db);
    app.decorate('offerStore', {
      listAccessible: async (userId: string, isAdmin: boolean) =>
        (isAdmin ? [id, second] : userId === 'no-offers' ? [] : [id]).map((offerId) => ({
          id: offerId,
          userId,
        })),
      permissions: async (offer: { userId: string }, userId: string, isAdmin: boolean) => ({
        read: isAdmin || offer.userId === userId,
      }),
      assertAccess: async () => ({ id }),
      maybeGet: async (offerId: string) =>
        (admin ? [id, second] : user === 'no-offers' ? [] : [id]).includes(offerId)
          ? { id: offerId, userId: user }
          : null,
    });
    app.decorate('userStore', {
      maybeGetById: async (user: string) => ({
        name: user === 'winner' ? 'Pessoa vencedora' : 'Primeira pessoa',
      }),
    });
    app.addHook('preHandler', async (req) => {
      req.user = {
        sub: user,
        role: admin ? 'admin' : 'user',
        email: 'fixture@example.test',
        iat: 0,
        exp: 0,
        tools: ['ofertas', 'logs', 'nav:scoped', 'nav:operator-activity'],
      };
    });
    await app.register(errorHandlerPlugin);
    registerUpsellOperatorAudit(app);
    const path = options.global
      ? '/tracking/upsell-operator-logs'
      : `/offers/${options.offer ?? id}/tracking/upsell-operator-logs`;
    const query = options.from ? `?from=${options.from}&to=${options.to}` : '';
    try {
      const r = await app.inject(path + query);
      expect(r.statusCode).toBe(options.status ?? 200);
      return r.json();
    } finally {
      await app.close();
    }
  };
  it('joins real paid proof, immutable winner and BRL totals through the actual report SQL', async () => {
    const result = await report('admin', true);
    expect(result.summary).toHaveLength(2);
    expect(result.summary[0]).toMatchObject({
      operator_id: 'winner',
      operator_name: 'Pessoa vencedora',
      confirmed_purchases: 1,
      amounts: [{ currency: 'BRL', amount_minor: 13000 }],
    });
    expect(result.summary[1]).toMatchObject({ operator_id: 'first', confirmed_purchases: 0 });
    expect(result.approvals[0].operator_id).toBe('winner');
  });
  it('does not assign an earlier click to a member or expose someone else’s approval', async () => {
    const result = await report('first', false);
    expect(result.summary).toHaveLength(1);
    expect(result.summary[0]).toMatchObject({ operator_id: 'first', confirmed_purchases: 0 });
    expect(result.approvals).toEqual([]);
    expect(JSON.stringify(result)).not.toContain('Pessoa vencedora');
    const winner = await report('winner', false);
    expect(winner.summary[0].confirmed_purchases).toBe(1);
  });
  it('rechecks company-local delegation and suspension for offer and combined reports', async () => {
    const companyId = randomUUID();
    try {
      await db`INSERT INTO companies(id,name,created_by) VALUES(${companyId},'Synthetic operator report','fixture-owner')`;
      await db`INSERT INTO company_memberships(company_id,user_id,role,status,tools,all_offers)
        VALUES(${companyId},'winner','member','active',ARRAY['ofertas','nav:scoped','nav:operator-activity'],true)`;
      await db`INSERT INTO company_offers(company_id,offer_id,owner_user_id) VALUES(${companyId},${id},'fixture-owner')`;
      const allowed = await report('winner', false);
      expect(allowed.scope).toBe('self');
      expect(allowed.summary.map((row: { operator_id: string }) => row.operator_id)).toEqual([
        'winner',
      ]);
      expect(allowed.approvals).toHaveLength(1);

      await db`UPDATE company_memberships SET tools=ARRAY['ofertas','nav:tracking-upsell-intelligence'] WHERE company_id=${companyId} AND user_id='winner'`;
      expect((await report('winner', false, { status: 403 })).code).toBe('section_forbidden');
      const excluded = await report('winner', false, { global: true });
      expect(excluded.summary).toEqual([]);
      expect(excluded.approvals).toEqual([]);
      expect(excluded.attempts).toEqual([]);

      await db`UPDATE company_memberships SET status='suspended' WHERE company_id=${companyId} AND user_id='winner'`;
      expect((await report('winner', false, { status: 403 })).code).toBe(
        'company_section_forbidden',
      );
    } finally {
      await db`DELETE FROM company_offers WHERE company_id=${companyId}`;
      await db`DELETE FROM company_memberships WHERE company_id=${companyId}`;
      await db`DELETE FROM companies WHERE id=${companyId}`;
    }
  });
  it('combines all authorized offers into one row per person', async () => {
    const result = await report('admin', true, { global: true });
    expect(result.scope).toBe('all_offers');
    expect(result.summary).toHaveLength(2);
    expect(result.summary[0]).toMatchObject({
      operator_id: 'winner',
      confirmed_purchases: 3,
      amounts: [{ currency: 'BRL', amount_minor: 31000 }],
    });
  });
  it('does not include another owner’s offer in a member global view', async () => {
    const result = await report('winner', false, { global: true });
    expect(result.summary[0]).toMatchObject({
      confirmed_purchases: 1,
      amounts: [{ currency: 'BRL', amount_minor: 13000 }],
    });
  });
  it('returns no data when no offer is authorized', async () => {
    const result = await report('no-offers', false, { global: true });
    expect(result.summary).toEqual([]);
    expect(result.approvals).toEqual([]);
    expect(result.attempts).toEqual([]);
  });
  it('puts approval after midnight on the previous day when its winning click was before midnight', async () => {
    const yesterday = await report('admin', true, {
      offer: second,
      from: '2026-10-15',
      to: '2026-10-15',
    });
    expect(yesterday.summary[0]).toMatchObject({
      confirmed_purchases: 1,
      amounts: [{ currency: 'BRL', amount_minor: 13000 }],
    });
    const today = await report('admin', true, {
      offer: second,
      from: '2026-10-16',
      to: '2026-10-16',
    });
    expect(today.summary[0]).toMatchObject({
      confirmed_purchases: 1,
      amounts: [{ currency: 'BRL', amount_minor: 5000 }],
    });
    const both = await report('admin', true, {
      offer: second,
      from: '2026-10-15',
      to: '2026-10-16',
    });
    expect(both.summary[0]).toMatchObject({
      confirmed_purchases: 2,
      amounts: [{ currency: 'BRL', amount_minor: 18000 }],
    });
  });
});
