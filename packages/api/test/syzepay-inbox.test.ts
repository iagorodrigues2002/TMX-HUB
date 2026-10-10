import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/env.js', () => ({
  env: {
    TRACKING_ENCRYPTION_KEY: 'test-secret-32-characters-long-enough',
    TRACKING_PUBLIC_BASE_URL: 'https://example.com',
  },
}));
import {
  syzepayPublicRoutes,
  syzepayAdminRoutes,
  syzeHash,
  syzeCompanyKey,
  syzeReceiptIdentity,
  syzeFeesSchema,
} from '../src/routes/syzepay.js';

const apps: ReturnType<typeof Fastify>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((a) => a.close()));
});
const token = 'a'.repeat(43);
function fixture() {
  const app = Fastify();
  apps.push(app);
  const bodies = new Map<string, { id: string; attempts: number }>();
  const receive = vi.fn(
    async (hash: string, body: Buffer, _contentType: string, _headers: Record<string, string>) => {
      if (hash !== syzeHash(token)) return null;
      const key = syzeReceiptIdentity(body).dedupeKey;
      const row = bodies.get(key) ?? { id: 'receipt-1', attempts: 0 };
      row.attempts++;
      bodies.set(key, row);
      return { ...row };
    },
  );
  app.register(syzepayPublicRoutes, { receive });
  return { app, receive, bodies };
}
describe('SyzePay isolated reception', () => {
  it('deduplicates event.id across retries with different formatting or delivery metadata', async () => {
    const { app, bodies } = fixture();
    const send = (payload: string) =>
      app.inject({
        method: 'POST',
        url: `/webhooks/syzepay?token=${token}`,
        headers: { 'content-type': 'application/json' },
        payload,
      });
    expect(
      (await send('{"event":{"id":"ev-1"},"order":{"id":"o-1"},"delivery":1}')).statusCode,
    ).toBe(200);
    expect(
      (await send('{ "order":{"id":"o-1"}, "event":{"id":"ev-1"}, "delivery":2 }')).json()
        .duplicate,
    ).toBe(true);
    expect(bodies.size).toBe(1);
  });
  it('never deduplicates a refund just because order.id matches an approval', () => {
    const identity = (value: unknown) =>
      syzeReceiptIdentity(Buffer.from(JSON.stringify(value))).dedupeKey;
    expect(identity({ order: { id: 'order-1', status: 'paid' } })).not.toBe(
      identity({ order: { id: 'order-1', status: 'refunded' } }),
    );
    expect(identity({ order: { id: 'order-1', status: 'paid' }, amount: 10 })).toBe(
      identity({ amount: 10, order: { status: 'paid', id: 'order-1' } }),
    );
    expect(identity({ event: { id: 'approve-1' }, order: { id: 'o-1' } })).not.toBe(
      identity({ event: { id: 'refund-1' }, order: { id: 'o-1' } }),
    );
  });
  it('authenticates before storage and preserves exact JSON bytes, not parsed sales', async () => {
    const { app, receive } = fixture();
    const body = '{ "event": "sale.approved", "product": { "id": "123" } }';
    const result = await app.inject({
      method: 'POST',
      url: `/webhooks/syzepay?token=${token}`,
      headers: {
        'content-type': 'application/json',
        'x-syzepay-signature': 'original',
        authorization: 'Bearer hidden',
      },
      payload: body,
    });
    expect(result.statusCode).toBe(200);
    expect(result.json()).toMatchObject({
      received: true,
      state: 'awaiting_mapping',
      duplicate: false,
    });
    expect(receive.mock.calls[0]?.[1].toString()).toBe(body);
    expect(receive.mock.calls[0]).toHaveLength(4);
    const headers = (receive.mock.calls[0] as unknown as unknown[])[3];
    expect(headers).toEqual({ 'x-syzepay-signature': 'original' });
  });
  it('rejects missing/invalid tokens and empty payloads', async () => {
    const { app, receive } = fixture();
    for (const suffix of ['', '?token=short'])
      expect(
        (await app.inject({ method: 'POST', url: '/webhooks/syzepay' + suffix, payload: 'x' }))
          .statusCode,
      ).toBe(401);
    expect(receive).not.toHaveBeenCalled();
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/webhooks/syzepay?token=${'b'.repeat(43)}`,
          payload: 'x',
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (await app.inject({ method: 'POST', url: `/webhooks/syzepay?token=${token}` })).statusCode,
    ).toBe(400);
  });
  it('accepts form payloads and groups identical retries without treating status changes as duplicates', async () => {
    const { app, bodies } = fixture();
    const request = {
      method: 'POST' as const,
      url: `/webhooks/syzepay?token=${token}`,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'id=1&status=paid',
    };
    expect((await app.inject(request)).json().duplicate).toBe(false);
    expect((await app.inject(request)).json().duplicate).toBe(true);
    expect(
      (await app.inject({ ...request, payload: 'id=1&status=refunded' })).json().duplicate,
    ).toBe(false);
    expect(bodies.size).toBe(2);
  });
  it('returns retryable storage failure and caps body size', async () => {
    const { app, receive } = fixture();
    receive.mockRejectedValue(new Error('storage failed'));
    expect(
      (await app.inject({ method: 'POST', url: `/webhooks/syzepay?token=${token}`, payload: 'x' }))
        .statusCode,
    ).toBe(503);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/webhooks/syzepay?token=${token}`,
          payload: 'x'.repeat(262145),
        })
      ).statusCode,
    ).toBe(413);
  });
  it('namesake companies have different keys for different owners', () => {
    expect(syzeCompanyKey('owner-a', 'TMX')).not.toBe(syzeCompanyKey('owner-b', 'TMX'));
    expect(syzeCompanyKey('owner-a', ' TMX ')).toBe(syzeCompanyKey('owner-a', 'tmx'));
  });
});
describe('SyzePay company permissions', () => {
  it('saves an owned connection fee model without writing offer-level VendePay settings', async () => {
    const app = Fastify();
    apps.push(app);
    const statements: string[] = [];
    const db = Object.assign(
      async (strings: TemplateStringsArray, ...values: unknown[]) => {
        statements.push(strings.join('?'));
        if (values[1] === 'own-connection' && values[2] === 'owner-a')
          return [{ id: 'own-connection', fee_settings: values[0] }];
        return [];
      },
      { json: (value: unknown) => value },
    );
    app.decorate('db', db);
    app.addHook('preHandler', async (req) => {
      req.user = { sub: 'owner-a', role: 'user' } as never;
    });
    app.register(syzepayAdminRoutes);
    const fees = {
      fee_pct: 4.5,
      fixed_fee_minor: 30,
      fee_currency: 'USD',
      reserve_pct: 5,
      chargeback_fee_minor: 1500,
      refund_fee_minor: 0,
    };
    const result = await app.inject({
      method: 'PUT',
      url: '/tracking/syzepay/connections/own-connection/fees',
      payload: fees,
    });
    expect(result.statusCode).toBe(200);
    expect(result.json().fee_settings).toEqual(fees);
    expect(statements).toHaveLength(1);
    expect(statements[0]).toContain('UPDATE syzepay_company_connections');
    expect(statements[0]).not.toContain('tracking_fee_settings');
  });
  it('validates independent fees and rejects negative tariffs, invalid percentages and fractional cents', () => {
    const fees = {
      fee_pct: 4.5,
      fixed_fee_minor: 30,
      fee_currency: 'USD',
      reserve_pct: 5,
      chargeback_fee_minor: 1500,
      refund_fee_minor: 0,
    };
    expect(syzeFeesSchema.parse(fees)).toEqual(fees);
    for (const patch of [
      { fee_pct: 101 },
      { reserve_pct: -1 },
      { fixed_fee_minor: 1.5 },
      { chargeback_fee_minor: -1 },
      { fee_currency: 'usd' },
      { unknown: 1 },
    ])
      expect(syzeFeesSchema.safeParse({ ...fees, ...patch }).success).toBe(false);
  });
  it('writes fees only on the specified connection owned by the authenticated user', async () => {
    const app = Fastify();
    apps.push(app);
    const queries: unknown[][] = [];
    const db = Object.assign(
      async (_strings: TemplateStringsArray, ...values: unknown[]) => {
        queries.push(values);
        return [];
      },
      { json: (value: unknown) => value },
    );
    app.decorate('db', db);
    app.addHook('preHandler', async (req) => {
      req.user = { sub: 'owner-a', role: 'user' } as never;
    });
    app.setErrorHandler((error, _req, reply) =>
      reply.code((error as any).status ?? 500).send({ error: error.message }),
    );
    app.register(syzepayAdminRoutes);
    const fees = {
      fee_pct: 4.5,
      fixed_fee_minor: 30,
      fee_currency: 'USD',
      reserve_pct: 5,
      chargeback_fee_minor: 1500,
      refund_fee_minor: 0,
    };
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/tracking/syzepay/connections/owner-b-connection/fees',
          payload: fees,
        })
      ).statusCode,
    ).toBe(404);
    expect(queries[0]).toEqual([fees, 'owner-b-connection', 'owner-a']);
  });
  it('lists only owned companies, not invited company-wide data', async () => {
    const app = Fastify();
    apps.push(app);
    app.decorate('offerStore', {
      listByUser: async () => [
        { userId: 'owner', companyName: 'TMX' },
        { userId: 'other', companyName: 'Secret company' },
      ],
    });
    app.addHook('preHandler', async (req) => {
      req.user = { sub: 'owner', role: 'user' } as never;
    });
    app.register(syzepayAdminRoutes);
    const result = await app.inject('/tracking/syzepay/companies');
    expect(result.statusCode).toBe(200);
    expect(result.json().companies).toEqual([
      { key: syzeCompanyKey('owner', 'TMX'), name: 'TMX', offers: 1 },
    ]);
  });
  it('cannot reveal another owners URL or inbox by connection ID', async () => {
    const app = Fastify();
    apps.push(app);
    const queries: unknown[][] = [];
    app.decorate('db', async (_strings: TemplateStringsArray, ...values: unknown[]) => {
      queries.push(values);
      return [];
    });
    app.addHook('preHandler', async (req) => {
      req.user = { sub: 'intruder', role: 'admin' } as never;
    });
    app.setErrorHandler((error, _req, reply) =>
      reply.code((error as any).status ?? 500).send({ error: error.message }),
    );
    app.register(syzepayAdminRoutes);
    expect((await app.inject('/tracking/syzepay/connections/other/receipts')).statusCode).toBe(404);
    expect(queries[0]).toEqual(['other', 'intruder']);
  });
});
