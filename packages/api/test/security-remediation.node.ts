import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';
import { Redis } from 'ioredis';
import { resolveAssets } from '../../core/src/assets/resolve.js';
import {
  createPublicLookup,
  isPublicAddress,
  publicFetch,
  publicHttpUrl,
} from '../../core/src/fetch/public-network.js';
import { settleDownloads } from '../src/lib/settle-downloads.js';
import { InviteStore } from '../src/services/invite-store.js';
import { configuredUpsellPage } from '../src/services/upsell-observation-policy.js';
import { UserStore } from '../src/services/user-store.js';

// This suite intentionally refuses any non-fixture Redis address.
const redisUrl = process.env.SECURITY_TEST_REDIS_URL;
async function withFixture(fn: (users: UserStore, invites: InviteStore) => Promise<void>) {
  assert.equal(process.env.TMX_ISOLATED_SECURITY_FIXTURE, 'network-none-dummy-redis');
  assert.equal(redisUrl, 'redis://127.0.0.1:6379/15');
  const redis = new Redis(redisUrl!, { maxRetriesPerRequest: 1, connectTimeout: 1000 });
  try {
    await redis.flushdb();
    await fn(new UserStore(redis), new InviteStore(redis));
  } finally {
    redis.disconnect();
  }
}
const account = (email: string) => ({
  email,
  name: 'Dummy',
  passwordHash: 'dummy-not-a-real-hash',
  role: 'user' as const,
});

test('one invitation creates at most one account under concurrent registration', async () => {
  await withFixture(async (users, invites) => {
    const invite = await invites.create({
      createdBy: 'dummy-admin',
      expiresInSec: 60,
      allowedTools: ['ofertas'],
    });
    const args = {
      invite: { token: invite.token, createdAt: invite.createdAt },
      allowedTools: ['ofertas'] as ['ofertas'],
    };
    const results = await Promise.allSettled([
      users.create({ ...account('a@fixture.invalid'), ...args }),
      users.create({ ...account('b@fixture.invalid'), ...args }),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(await users.count(), 1);
    assert.equal(await invites.get(invite.token), null);
    assert.deepEqual((await users.listAll())[0]!.allowedTools, ['ofertas']);
  });
});

test('only one competing first registration becomes administrator', async () => {
  await withFixture(async (users) => {
    const results = await Promise.allSettled(
      ['a', 'b'].map((name) =>
        users.create({
          ...account(`${name}@fixture.invalid`),
          role: 'admin',
          requireEmptyStore: true,
        }),
      ),
    );
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(await users.countAdmins(), 1);
  });
});

test('duplicate email neither creates a second user nor consumes an unused invite', async () => {
  await withFixture(async (users, invites) => {
    const results = await Promise.allSettled([
      users.create(account('a@fixture.invalid')),
      users.create(account('A@fixture.invalid')),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    const invite = await invites.create({ createdBy: 'dummy-admin', expiresInSec: 60 });
    await assert.rejects(users.create({ ...account('a@fixture.invalid'), invite }));
    assert.ok(await invites.get(invite.token));
    assert.equal(await users.count(), 1);
  });
});

test('revoked invitation cannot leave an account behind', async () => {
  await withFixture(async (users, invites) => {
    const invite = await invites.create({ createdBy: 'dummy-admin', expiresInSec: 60 });
    await invites.revoke(invite.token);
    await assert.rejects(users.create({ ...account('a@fixture.invalid'), invite }));
    assert.equal(await users.count(), 0);
  });
});

test('public upsell observations select only configured path and query', () => {
  const configured = 'https://shop.fixture.invalid/upsell?offer=trusted';
  assert.equal(
    configuredUpsellPage('https://shop.fixture.invalid/upsell?vendaId=dummy', [configured]),
    configured,
  );
  assert.equal(
    configuredUpsellPage('https://shop.fixture.invalid/redirect?url=private', [configured]),
    null,
  );
  assert.equal(configuredUpsellPage('https://other.fixture.invalid/upsell', [configured]), null);
  assert.equal(configuredUpsellPage('file:///etc/passwd', [configured]), null);
});

test('public network policy rejects alternate encodings and non-global addresses', async () => {
  for (const ip of [
    '127.0.0.1',
    '10.2.3.4',
    '100.64.0.1',
    '169.254.169.254',
    '192.168.1.1',
    '172.31.0.1',
    '224.0.0.1',
    '0.0.0.0',
    '::1',
    'fc00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '2001:0db8::1',
    '2001:2::1',
    '3fff::1',
  ]) {
    assert.equal(isPublicAddress(ip), false, ip);
  }
  assert.equal(isPublicAddress('8.8.8.8'), true);
  assert.equal(isPublicAddress('2606:4700:4700::1111'), true);
  for (const url of [
    'http://2130706433/',
    'http://0177.0.0.1/',
    'http://[::ffff:7f00:1]/',
    'file:///etc/passwd',
    'http://localhost/',
    'http://x.localhost/',
  ]) {
    assert.throws(() => publicHttpUrl(url));
    await assert.rejects(publicFetch(url));
  }
  assert.equal(publicHttpUrl('https://example.com/path').hostname, 'example.com');
});

test('connection lookup returns the checked IP and rejects a later private DNS answer', async () => {
  let addresses = [{ address: '8.8.8.8', family: 4 }];
  const resolver = (
    _host: string,
    _options: unknown,
    done: (error: Error | null, values: typeof addresses) => void,
  ) => done(null, addresses);
  const guarded = createPublicLookup(resolver as never);
  const connect = () =>
    new Promise<string>((resolve, reject) => {
      guarded('fixture.invalid', {}, (error, address) =>
        error ? reject(error) : resolve(address),
      );
    });
  assert.equal(await connect(), '8.8.8.8');
  addresses = [{ address: '127.0.0.1', family: 4 }];
  await assert.rejects(connect(), /non-public/);
  addresses = [
    { address: '8.8.8.8', family: 4 },
    { address: '::1', family: 6 },
  ];
  await assert.rejects(connect(), /non-public/);
});

test('HTML asset count is bounded before any network download', async () => {
  await assert.rejects(
    resolveAssets('<img src="/1"><img src="/2"><img src="/3">', 'https://fixture.invalid', {
      download: true,
      maxAssets: 2,
    }),
    /count budget/,
  );
});

test('all successful sibling downloads are collected before failure is propagated', async () => {
  for (const delayed of [false, true]) {
    const paths: string[] = [];
    let release!: (value: { filePath: string }) => void;
    const success = delayed
      ? new Promise<{ filePath: string }>((resolve) => {
          release = resolve;
        })
      : Promise.resolve({ filePath: '/scratch/dummy-success' });
    const pending = settleDownloads([success, Promise.reject(new Error('dummy failure'))], paths);
    const assertion = assert.rejects(pending, /dummy failure/);
    if (delayed) {
      await Promise.resolve();
      assert.deepEqual(paths, []);
      release({ filePath: '/scratch/dummy-success' });
    }
    await assertion;
    assert.deepEqual(paths, ['/scratch/dummy-success']);
  }
});

test('gateway routes deny member global claims while preserving admin and offer-local edits', async () => {
  const { default: gatewayRoutes } = await import('../src/routes/tracking-admin.js');
  for (const fixture of [
    {
      role: 'user',
      method: 'POST',
      provider: 'explodely',
      body: { provider: 'explodely', name: 'Dummy connection', vendor_id: 'dummy-vendor' },
      status: 403,
    },
    {
      role: 'admin',
      method: 'POST',
      provider: 'explodely',
      body: { provider: 'explodely', name: 'Dummy connection', vendor_id: 'dummy-vendor' },
      status: 201,
    },
    {
      role: 'user',
      method: 'POST',
      provider: 'paysight',
      body: { provider: 'paysight', name: 'Dummy connection' },
      status: 201,
    },
    {
      role: 'user',
      method: 'PATCH',
      provider: 'explodely',
      body: { vendor_id: 'dummy-other-vendor' },
      status: 403,
    },
    {
      role: 'user',
      method: 'PATCH',
      provider: 'explodely',
      body: { name: 'Dummy renamed connection' },
      status: 200,
    },
  ] as const) {
    const app = Fastify();
    let writes = 0;
    const db = Object.assign(
      async (parts: TemplateStringsArray) => {
        const query = parts.join('?');
        if (query.includes('SELECT id FROM tracking_projects')) return [{ id: 'dummy-project' }];
        if (query.includes('SELECT g.provider')) return [{ provider: fixture.provider }];
        if (
          /INSERT INTO tracking_gateway_connections|UPDATE tracking_gateway_connections/.test(query)
        ) {
          writes += 1;
          return [
            { id: 'dummy-connection', provider: fixture.provider, name: 'Dummy', settings: {} },
          ];
        }
        throw new Error('Unexpected fixture query');
      },
      { json: (value: unknown) => value },
    );
    app.decorate('db', db as never);
    app.decorate('offerStore', {
      assertTrackingManager: async (offer: string, user: string) => {
        assert.equal(offer, 'dummy-offer');
        assert.equal(user, 'dummy-owner');
      },
    } as never);
    app.addHook('onRequest', async (request) => {
      request.user = {
        sub: 'dummy-owner',
        email: 'owner@fixture.invalid',
        role: fixture.role,
        iat: 1,
        exp: 4_102_444_800,
      };
    });
    try {
      await app.register(gatewayRoutes);
      const response = await app.inject({
        method: fixture.method,
        url: `/offers/dummy-offer/tracking/gateway-connections${fixture.method === 'PATCH' ? '/dummy-connection' : ''}`,
        payload: fixture.body,
      });
      assert.equal(response.statusCode, fixture.status, response.body);
      assert.equal(writes, fixture.status === 403 ? 0 : 1);
    } finally {
      await app.close();
    }
  }
});
