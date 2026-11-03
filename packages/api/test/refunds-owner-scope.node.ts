import assert from 'node:assert/strict';
import { test } from 'node:test';
import Fastify from 'fastify';
import errorHandler from '../src/plugins/error-handler.js';
import plugin from '../src/routes/refunds-dashboard.js';
import type { buildRefundAnalytics } from '../src/services/refund-analytics.js';

// Route-level injection: no listening server, Redis, PostgreSQL or provider connections.
async function report(sub: string, role: 'admin' | 'user', query: Record<string, string> = {}) {
  let queriedIds: unknown;
  const candidates = [
    { id: 'mine', userId: 'admin-owner', companyName: ' TMX ', name: 'PJR_ENG', memberIds: [] },
    { id: 'foreign', userId: 'other-owner', companyName: 'tmx', name: 'PJR_ENG', memberIds: [] },
    {
      id: 'mine-other-company',
      userId: 'admin-owner',
      companyName: 'Fangzi.tech',
      name: 'SLM_ENG',
      memberIds: [],
    },
    { id: 'mine-no-company', userId: 'admin-owner', name: 'SLM_DE', memberIds: [] },
  ];
  const app = Fastify();
  app.decorate('offerStore', {
    listAccessible: async (_id: string, admin: boolean) =>
      admin ? candidates : candidates.filter((o) => o.userId === sub),
  });
  const db = async (_strings: TemplateStringsArray, ...values: unknown[]) => {
    const statement = _strings.join('');
    // These cases exercise legacy owners without migrated company memberships.
    if (/FROM company_memberships|FROM company_offers/.test(statement)) return [];
    if (_strings.join('').includes('FROM webhook_receipts wr'))
      return (values.find(Array.isArray) as string[]).map((id) => ({
        order_id: id,
        external_id: id,
        provider: 'vendepay',
        received_at: '2026-09-10T12:00:00Z',
        payload: { checkoutId: id, event: 'refund' },
      }));
    queriedIds = values.find(Array.isArray);
    return (queriedIds as string[]).map((id) => ({
      id,
      external_id: id,
      status: 'refunded',
      origin: 'natural',
      offer_id: id,
      provider: 'vendepay',
      connection_name: 'Fixture',
      product_name: 'Front',
      paid_at: '2026-09-01T12:00:00Z',
      reversal_at: '2026-09-10T12:00:00Z',
      amount_brl_minor: id === 'mine' ? '10000' : '90000',
      penalty_brl_minor: '2700',
    }));
  };
  Object.assign(db, { unsafe: (sql: string) => sql });
  app.decorate('db', db);
  app.addHook('preHandler', async (request) => {
    request.user = { sub, role, email: 'fixture@example.test', iat: 0, exp: 9999999999 };
  });
  await errorHandler(app, {});
  await app.register(plugin);
  try {
    const response = await app.inject({
      method: 'GET',
      url: '/tracking/refunds-dashboard',
      query: { from: '2026-09-01', to: '2026-09-30', ...query },
    });
    return {
      queriedIds,
      status: response.statusCode,
      body: response.json<ReturnType<typeof buildRefundAnalytics>>(),
    };
  } finally {
    await app.close();
  }
}

test('administrator default includes only owned TMX offers, excluding other companies and missing company', async () => {
  const result = await report('admin-owner', 'admin');
  assert.equal(result.status, 200);
  assert.deepEqual(result.queriedIds, ['mine']);
  assert.equal(result.body.totals.gross_brl_minor, 10000);
  assert.equal(result.body.totals.brl_minor, 10000);
  assert.equal(result.body.totals.fee_brl_minor, 2700);
  assert.equal(result.body.rankings.offers.length, 1);
});
test('another owner consolidates only their offers despite identical names', async () => {
  assert.deepEqual((await report('other-owner', 'user')).queriedIds, ['foreign']);
});
test('admin with no own offers has empty totals and never queries other owners', async () => {
  const result = await report('empty-owner', 'admin');
  assert.equal(result.queriedIds, undefined);
  assert.equal(result.body.totals.gross_brl_minor, 0);
});
test('explicit admin inspection stays isolated to the selected offer', async () => {
  assert.deepEqual((await report('admin-owner', 'admin', { offer_id: 'foreign' })).queriedIds, [
    'foreign',
  ]);
});
test('explicit foreign offer remains forbidden to a non-admin', async () => {
  const result = await report('admin-owner', 'user', { offer_id: 'foreign' });
  assert.equal(result.status, 404);
  assert.equal(result.queriedIds, undefined);
});
