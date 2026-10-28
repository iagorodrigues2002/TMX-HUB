import { createECDH } from 'node:crypto';
import Fastify from 'fastify';
import { expect, it, vi } from 'vitest';
import webpush from 'web-push';
import { encryptSecret } from '../src/lib/secret-box.js';
vi.mock('../src/env.js', () => ({
  env: {
    WEB_PUSH_PUBLIC_KEY: 'public',
    WEB_PUSH_PRIVATE_KEY: 'private',
    WEB_PUSH_SUBJECT: 'https://example.com',
    JWT_SECRET: 'isolated-secret',
  },
}));
vi.mock('../src/lib/url-safety.js', () => ({
  assertSafeOutboundUrl: vi.fn().mockResolvedValue(undefined),
}));
import { browserPushRoutes } from '../src/routes/browser-push.js';
import {
  allowedPushEndpoint,
  pushId,
  pushSubscriptionSchema,
  runBrowserPush,
} from '../src/services/browser-push.js';

const subscription = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/fixture',
  keys: {
    p256dh: Buffer.alloc(65, 4).toString('base64url'),
    auth: Buffer.alloc(16, 1).toString('base64url'),
  },
};
it('builds a valid encrypted Web Push request locally without contacting a provider', () => {
  const vapid = webpush.generateVAPIDKeys();
  const browserKey = createECDH('prime256v1');
  browserKey.generateKeys();
  const sub = {
    ...subscription,
    keys: { ...subscription.keys, p256dh: browserKey.getPublicKey().toString('base64url') },
  };
  const request = webpush.generateRequestDetails(sub, '{"id":"private-sale-id"}', {
    TTL: 60,
    urgency: 'high',
    vapidDetails: { subject: 'https://example.com', ...vapid },
  });
  expect(request.headers['Content-Encoding']).toBe('aes128gcm');
  expect(request.body?.includes('private-sale-id')).toBe(false);
  expect(request.headers.Authorization).toBeTruthy();
});

it('push management requires authentication on every endpoint', async () => {
  const app = Fastify();
  await app.register(browserPushRoutes);
  try {
    for (const method of ['GET', 'PUT', 'DELETE'] as const)
      expect((await app.inject({ method, url: '/tracking/browser-push' })).statusCode).toBe(401);
  } finally {
    await app.close();
  }
});
it('rejects SSRF hosts, schemes, credentials and malformed browser keys', () => {
  for (const value of [
    'http://fcm.googleapis.com/x',
    'https://localhost/x',
    'https://fcm.googleapis.com.attacker.com/x',
    'https://user:pass@fcm.googleapis.com/x',
    'https://fcm.googleapis.com:444/x',
    'https://169.254.169.254/latest',
  ])
    expect(allowedPushEndpoint(value)).toBe(false);
  expect(pushSubscriptionSchema.safeParse(subscription).success).toBe(true);
  expect(
    pushSubscriptionSchema.safeParse({ ...subscription, keys: { auth: 'x', p256dh: 'y' } }).success,
  ).toBe(false);
});

function fixture(options: { allowed?: boolean; expired?: boolean; user?: boolean } = {}) {
  const row = {
    order_id: 'order',
    subscription_id: pushId(subscription.endpoint),
    user_id: 'member',
    offer_id: 'offer',
    created_at: new Date(Date.now() - (options.expired ? 70000 : 1000)),
    attempts: 1,
    secret_encrypted: encryptSecret(JSON.stringify(subscription), 'isolated-secret'),
  };
  const db = vi.fn(async (strings: TemplateStringsArray, ..._values: unknown[]) => {
    const query = strings.join('?');
    if (query.includes('WITH due')) return [row];
    if (query.includes('SELECT id FROM browser_push_subscriptions'))
      return [{ id: row.subscription_id }];
    return [];
  });
  const app = {
    db,
    userStore: {
      maybeGetById: vi
        .fn()
        .mockResolvedValue(options.user === false ? null : { id: 'member', role: 'user' }),
    },
    offerStore: {
      listAccessible: vi.fn().mockResolvedValue(options.allowed === false ? [] : [{ id: 'offer' }]),
    },
    log: { warn: vi.fn() },
  };
  const send = vi.fn().mockResolvedValue({ statusCode: 201 });
  return { app, db, send };
}
it('sends an encrypted, generic notification only for an accessible approved sale', async () => {
  const { app, db, send } = fixture();
  await runBrowserPush(app as never, send);
  expect(send).toHaveBeenCalledTimes(1);
  const payload = JSON.parse(send.mock.calls[0][1]);
  expect(payload.id).toBe('order');
  expect(Object.keys(payload).sort()).toEqual(['createdAt', 'id', 'userId']);
  expect(send.mock.calls[0][2]).toMatchObject({ urgency: 'high', timeout: 5000 });
  expect(
    db.mock.calls.some(([q, ...v]) => q.join('').includes('SET state=') && v.includes('delivered')),
  ).toBe(true);
});
it('does not leak sales to a revoked/deleted user or send stale sales', async () => {
  for (const option of [{ allowed: false }, { user: false }, { expired: true }]) {
    const { app, send } = fixture(option);
    await runBrowserPush(app as never, send);
    expect(send).not.toHaveBeenCalled();
  }
});
it('removes expired endpoints and bounds retries for transient provider failures', async () => {
  for (const statusCode of [410, 503]) {
    const { app, db, send } = fixture();
    send.mockRejectedValueOnce({ statusCode });
    await runBrowserPush(app as never, send);
    expect(
      db.mock.calls.some(([q]) =>
        q.join('').includes('DELETE FROM browser_push_subscriptions WHERE id='),
      ),
    ).toBe(statusCode === 410);
    const update = db.mock.calls.findLast(
      ([q, ...values]) => q.join('').includes('SET state=') && values.length > 0,
    );
    expect(update?.slice(1)).toContain(statusCode === 410 ? 'dead' : 'pending');
  }
});
it('registration cannot overwrite another user and deletion is scoped to the authenticated user', async () => {
  const app = Fastify();
  const db = vi.fn().mockResolvedValue([]);
  app.decorate('db', db);
  app.addHook('onRequest', async (req) => {
    req.user = { sub: 'member', role: 'user' } as never;
  });
  await app.register(browserPushRoutes);
  try {
    expect(
      (await app.inject({ method: 'PUT', url: '/tracking/browser-push', payload: subscription }))
        .statusCode,
    ).toBe(409);
    expect(db.mock.calls[0][0].join('')).toContain(
      'WHERE browser_push_subscriptions.user_id=EXCLUDED.user_id',
    );
    const id = pushId(subscription.endpoint);
    expect(
      (await app.inject({ method: 'DELETE', url: '/tracking/browser-push', payload: { id } }))
        .statusCode,
    ).toBe(200);
    expect(db.mock.calls.at(-1).slice(1)).toEqual([id, 'member']);
  } finally {
    await app.close();
  }
});
