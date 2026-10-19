import { createHmac, randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import postgres from 'postgres';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { env } from '../src/env.js';
import rateLimitPlugin from '../src/plugins/rate-limit.js';
import publicRoutes from '../src/routes/tracking-public.js';
import utmifyRoutes from '../src/routes/utmify-tracking-admin.js';
import { checkUpsellCompatibility } from '../src/services/upsell-compatibility.js';

vi.mock('../src/services/upsell-compatibility.js', () => ({
  checkUpsellCompatibility: vi.fn().mockResolvedValue(true),
}));

const encryptionKey = env.TRACKING_ENCRYPTION_KEY;
afterEach(() => {
  env.TRACKING_ENCRYPTION_KEY = encryptionKey;
  vi.clearAllMocks();
  vi.mocked(checkUpsellCompatibility).mockResolvedValue(true);
});

it('rotating an unverified API key cannot create fresh rate-limit buckets', async () => {
  const counts = new Map<string, number>();
  const app = Fastify();
  app.decorate('redis', {
    defineCommand: vi.fn(),
    rateLimit: (
      key: string,
      _window: number,
      _max: number,
      _continue: boolean,
      _backoff: boolean,
      callback: (err: null, result: [number, number]) => void,
    ) => {
      const count = (counts.get(key) ?? 0) + 1;
      counts.set(key, count);
      callback(null, [count, 60_000]);
    },
  } as never);
  try {
    await app.register(rateLimitPlugin);
    app.get('/limited', { config: { rateLimit: { max: 2, timeWindow: 60_000 } } }, async () => ({
      ok: true,
    }));
    const statuses = [];
    for (const key of ['forged-a', 'forged-b', 'forged-c']) {
      statuses.push(
        (await app.inject({ url: '/limited', headers: { 'x-api-key': key } })).statusCode,
      );
    }
    expect(statuses).toEqual([200, 200, 429]);
  } finally {
    await app.close();
  }
});

function signedObservation(projectId = 'project-fixture', stageId = 'stage-fixture') {
  const encoded = Buffer.from(
    JSON.stringify({
      projectId,
      stageId,
      visitorId: 'signed-visitor',
      journeyId: 'signed-journey',
      issuedAt: 1,
    }),
  ).toString('base64url');
  return `${encoded}.${createHmac('sha256', env.WEBHOOK_SECRET).update(`upsell|${encoded}`).digest('base64url')}`;
}

it.each([
  {
    name: 'unsigned observation',
    signed: false,
    approved: true,
    configured: true,
    confirm: false,
    identities: 0,
  },
  {
    name: 'unconfigured destination',
    signed: true,
    approved: true,
    configured: false,
    confirm: false,
    identities: 0,
  },
  {
    name: 'no matching approved front',
    signed: true,
    approved: false,
    configured: true,
    confirm: false,
    identities: 0,
  },
  {
    name: 'verified observation for the front account with a query-distinct destination',
    signed: true,
    approved: true,
    configured: true,
    confirm: true,
    identities: 1,
  },
  {
    name: 'front without a connection uses the stored default',
    signed: true,
    approved: true,
    configured: true,
    confirm: true,
    identities: 1,
    connectionId: null,
    expectedDestination: 'https://shop.fixture.invalid/upsell?account=A',
  },
  {
    name: 'front account uses the configured gateway fallback',
    signed: true,
    approved: true,
    configured: true,
    confirm: true,
    identities: 1,
    connectionId: 'account-without-specific-mapping',
    gatewayDestination: 'https://shop.fixture.invalid/upsell?account=gateway',
    expectedDestination: 'https://shop.fixture.invalid/upsell?account=gateway',
  },
  {
    name: 'front account without a configured destination cannot use another account',
    signed: true,
    approved: true,
    configured: true,
    confirm: false,
    identities: 0,
    connectionId: 'unmapped-account',
  },
])('$name cannot rebind a buyer and uses only the stored destination', async (fixture) => {
  env.TRACKING_ENCRYPTION_KEY = 'fixture-only-encryption-key-32-characters';
  const connectionId = 'connectionId' in fixture ? fixture.connectionId : 'account-fixture';
  const calls: { query: string; values: unknown[] }[] = [];
  let inTransaction = false;
  vi.mocked(checkUpsellCompatibility).mockImplementation(async () => {
    expect(inTransaction).toBe(false);
    return true;
  });
  const db = Object.assign(
    vi.fn(async (parts: TemplateStringsArray, ...values: unknown[]) => {
      const query = parts.join('?').replace(/\s+/g, ' ').trim();
      calls.push({ query, values });
      if (query.includes('FROM tracking_upsell_stages'))
        return [
          {
            id: 'stage-fixture',
            project_id: 'project-fixture',
            destination_url: 'https://shop.fixture.invalid/upsell?account=A',
            connection_destinations: {
              'account-fixture': 'https://shop.fixture.invalid/upsell?account=B',
              ...('gatewayDestination' in fixture
                ? { 'gateway:vendepay': fixture.gatewayDestination }
                : {}),
            },
          },
        ];
      if (query.includes('FROM tracking_orders'))
        return fixture.approved
          ? [
              {
                id: 'order-fixture',
                visitor_id: 'signed-visitor',
                vendepay_connection_id: connectionId,
              },
            ]
          : [];
      if (
        query.startsWith('INSERT INTO tracking_events') ||
        query.startsWith('INSERT INTO tracking_upsell_identities')
      )
        return [];
      throw new Error(`Unexpected query: ${query}`);
    }),
    {
      json: (value: unknown) => value,
      begin: async (fn: (sql: unknown) => Promise<unknown>) => {
        inTransaction = true;
        try {
          return await fn(db);
        } finally {
          inTransaction = false;
        }
      },
    },
  );
  const app = Fastify();
  app.decorate('db', db as never);
  try {
    await app.register(publicRoutes);
    const response = await app.inject({
      method: 'POST',
      url: '/track/upsell/events',
      payload: {
        public_key: 'public-fixture',
        stage_key: 'upsell_1',
        ...(fixture.signed ? { token: signedObservation() } : {}),
        visitor_id: 'untrusted-visitor',
        journey_id: 'untrusted-journey',
        event_name: 'UpsellOfferView',
        vendid: 'sale-fixture',
        event_url: `https://shop.fixture.invalid/${fixture.configured ? 'upsell' : 'redirect'}?account=B&target=untrusted`,
      },
    });
    expect(response.statusCode).toBe(202);
    expect(
      calls.filter(({ query }) => query.startsWith('INSERT INTO tracking_events')),
    ).toHaveLength(1);
    expect(
      calls.filter(({ query }) => query.startsWith('INSERT INTO tracking_upsell_identities')),
    ).toHaveLength(fixture.identities);
    expect(checkUpsellCompatibility).toHaveBeenCalledTimes(fixture.confirm ? 1 : 0);
    if (fixture.confirm)
      expect(checkUpsellCompatibility).toHaveBeenCalledWith(
        'expectedDestination' in fixture
          ? fixture.expectedDestination
          : 'https://shop.fixture.invalid/upsell?account=B',
        'sale-fixture',
      );
    const front = calls.find(({ query }) => query.includes('FROM tracking_orders'));
    if (fixture.signed) {
      expect(front?.query).toContain(
        "provider='vendepay' AND status='paid' AND paid_at IS NOT NULL",
      );
      expect(front?.query).toContain('external_id=? AND visitor_id=?');
      expect(front?.values).toEqual(['project-fixture', 'sale-fixture', 'signed-visitor']);
    } else expect(front).toBeUndefined();
    const identity = calls.find(({ query }) =>
      query.startsWith('INSERT INTO tracking_upsell_identities'),
    );
    if (identity) {
      expect(identity.query).toContain('ON CONFLICT DO NOTHING');
      expect(identity.query).toContain('FROM tracking_orders WHERE id=? AND project_id=?');
      expect(identity.query).toContain(
        "order_kind='front' AND provider='vendepay' AND status='paid' AND paid_at IS NOT NULL",
      );
      expect(identity.query).toContain('external_id=? AND visitor_id=?');
      expect(identity.query).toContain('vendepay_connection_id IS NOT DISTINCT FROM ?');
      expect(identity.values.slice(-5)).toEqual([
        'order-fixture',
        'project-fixture',
        'sale-fixture',
        'signed-visitor',
        connectionId,
      ]);
    }
  } finally {
    await app.close();
  }
});

// Explicit opt-in for a migrated disposable database; never use DATABASE_URL.
const fixtureDatabase = process.env.SECURITY_BOUNDARIES_TEST_DATABASE_URL;
describe.skipIf(!fixtureDatabase)('upsell identity authority with PostgreSQL', () => {
  it.each(['unchanged', 'refunded', 'connection-changed'] as const)(
    'rechecks the approved front after HTTP: %s',
    async (change) => {
      const db = postgres(fixtureDatabase ?? 'postgres://unused', { max: 1 });
      const id = `security-${randomUUID()}`;
      const app = Fastify();
      env.TRACKING_ENCRYPTION_KEY = 'fixture-only-encryption-key-32-characters';
      try {
        await db`INSERT INTO tracking_projects(id,offer_id,public_key) VALUES(${id},${id},${id})`;
        await db`INSERT INTO vendepay_connections(id,project_id,token_hash) VALUES(${id},${id},${id})`;
        await db`INSERT INTO tracking_upsell_stages(id,project_id,stage_key,name,slug,destination_url,connection_destinations)
          VALUES(${id},${id},'upsell_1','Fixture',${id},'https://shop.fixture.invalid/upsell?account=A',
          ${db.json({ [id]: 'https://shop.fixture.invalid/upsell?account=B' })})`;
        await db`INSERT INTO tracking_orders(id,project_id,provider,external_id,status,order_kind,paid_at,occurred_at,visitor_id,vendepay_connection_id)
          VALUES(${id},${id},'vendepay',${id},'paid','front',now(),now(),'signed-visitor',${id})`;
        vi.mocked(checkUpsellCompatibility).mockImplementation(async () => {
          if (change === 'refunded')
            await db`UPDATE tracking_orders SET status='refunded',refunded_at=now() WHERE id=${id}`;
          if (change === 'connection-changed')
            await db`UPDATE tracking_orders SET vendepay_connection_id=NULL WHERE id=${id}`;
          return true;
        });
        app.decorate('db', db);
        await app.register(publicRoutes);
        const request = () =>
          app.inject({
            method: 'POST',
            url: '/track/upsell/events',
            payload: {
              public_key: id,
              stage_key: 'upsell_1',
              token: signedObservation(id, id),
              visitor_id: 'untrusted-visitor',
              journey_id: 'untrusted-journey',
              event_name: 'UpsellOfferView',
              vendid: id,
              event_url: 'https://shop.fixture.invalid/upsell?account=B&vendaId=fixture',
            },
          });
        expect((await request()).statusCode).toBe(202);
        expect(checkUpsellCompatibility).toHaveBeenCalledWith(
          'https://shop.fixture.invalid/upsell?account=B',
          id,
        );
        const identities =
          await db`SELECT id,source_order_id,visitor_id,vendepay_connection_id FROM tracking_upsell_identities WHERE project_id=${id}`;
        expect(identities).toHaveLength(change === 'unchanged' ? 1 : 0);
        if (change === 'unchanged') {
          expect(identities[0]).toMatchObject({
            source_order_id: id,
            visitor_id: 'signed-visitor',
            vendepay_connection_id: id,
          });
          expect((await request()).statusCode).toBe(202);
          const replay = await db`SELECT id FROM tracking_upsell_identities WHERE project_id=${id}`;
          expect(replay.map((row) => row.id)).toEqual([identities[0]!.id]);
        }
      } finally {
        await app.close();
        await db`DELETE FROM tracking_projects WHERE id=${id}`;
        await db.end();
      }
    },
  );
});

it('offer reconciliation binds the project and offer-scoped destinations before enqueueing', async () => {
  const calls: { query: string; values: unknown[] }[] = [];
  const db = Object.assign(
    vi.fn((parts: TemplateStringsArray | string[], ...values: unknown[]) => {
      if (!('raw' in parts)) return parts;
      const query = parts.join('?').replace(/\s+/g, ' ').trim();
      calls.push({ query, values });
      if (query.includes('SELECT id FROM tracking_projects'))
        return Promise.resolve([{ id: 'project-fixture' }]);
      if (query.startsWith('WITH matches AS')) return Promise.resolve([{ id: 'upsell-fixture' }]);
      if (query.startsWith('UPDATE tracking_delivery_outbox'))
        return Promise.resolve([{ id: 'delivery-fixture' }]);
      throw new Error(`Unexpected query: ${query}`);
    }),
    { begin: async (fn: (sql: unknown) => Promise<unknown>) => fn(db) },
  );
  const app = Fastify();
  const access = vi.fn().mockResolvedValue(undefined);
  const enqueue = vi.fn().mockResolvedValue(undefined);
  app.decorate('db', db as never);
  app.decorate('offerStore', { assertManager: access } as never);
  app.decorate('utmifyDeliveryQueue', { add: enqueue } as never);
  app.addHook('onRequest', async (req) => {
    req.user = {
      sub: 'member-fixture',
      email: 'member@fixture.invalid',
      role: 'user',
      iat: 1,
      exp: 4_102_444_800,
    };
  });
  try {
    await app.register(utmifyRoutes);
    const response = await app.inject({
      method: 'POST',
      url: '/offers/offer-fixture/tracking/utmify-upsells/reconcile',
    });
    expect(response.statusCode).toBe(202);
    expect(access).toHaveBeenCalledWith('offer-fixture', 'member-fixture', false);
    const outbox = calls.find(({ query }) => query.startsWith('UPDATE tracking_delivery_outbox'));
    expect(outbox?.query).toContain(
      "destination_id IN ( SELECT id FROM tracking_utmify_destinations WHERE project_id=? AND scope='offer' )",
    );
    expect(outbox?.values).toEqual(['project-fixture', ['upsell-fixture'], 'project-fixture']);
    expect(enqueue).toHaveBeenCalledWith(
      'send',
      { deliveryId: 'delivery-fixture' },
      expect.any(Object),
    );
  } finally {
    await app.close();
  }
});
