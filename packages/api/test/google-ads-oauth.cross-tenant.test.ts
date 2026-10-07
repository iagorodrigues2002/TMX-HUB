import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => vi.unstubAllEnvs());

describe('Google Ads OAuth cross-tenant isolation', () => {
  it('signs user and offer into state and rejects callback from another user', async () => {
    vi.stubEnv('JWT_SECRET', 'test-only-jwt-secret-at-least-32-characters');
    vi.stubEnv('GOOGLE_ADS_OAUTH_CLIENT_ID', 'client-id');
    vi.stubEnv('GOOGLE_ADS_OAUTH_CLIENT_SECRET', 'client-secret');
    vi.stubEnv('GOOGLE_ADS_OAUTH_REDIRECT_URI', 'https://example.com/tracking/google-callback');
    const [{ default: routes }, { env }] = await Promise.all([
      import('../src/routes/google-ads-oauth.js'),
      import('../src/env.js'),
    ]);
    const originalKey = env.TRACKING_ENCRYPTION_KEY;
    env.TRACKING_ENCRYPTION_KEY = 'test-only-encryption-key-at-least-32-characters';
    const transaction = vi.fn(async () => []);
    const db = Object.assign(
      vi.fn(async (strings: TemplateStringsArray) => {
        const query = strings.join('?');
        if (query.includes('SELECT d.id FROM tracking_google_ads_destinations')) {
          return [{ id: 'destination-a' }];
        }
        if (query.includes('DELETE FROM tracking_google_ads_oauth_states s')) {
          return [{ verifier_encrypted: 'unused-because-state-user-does-not-match' }];
        }
        return [];
      }),
      {
        begin: vi.fn(async (run: (sql: typeof transaction) => Promise<unknown>) =>
          run(transaction),
        ),
      },
    );
    let currentUser = 'user-a';
    const app = Fastify();
    app.decorate('db', db);
    app.decorate('offerStore', { assertManager: vi.fn().mockResolvedValue(undefined) });
    app.addHook('preHandler', async (request) => {
      (request as typeof request & { user: { sub: string; role: string } }).user = {
        sub: currentUser,
        role: 'user',
      };
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    try {
      await app.register(routes);
      const start = await app.inject({
        method: 'POST',
        url: '/offers/offer-a/tracking/google-ads/destinations/destination-a/oauth/start',
      });

      expect(start.statusCode).toBe(200);
      const body = start.json<{ authorization_url: string; state: string }>();
      const [encoded, signature] = body.state.split('.');
      expect(signature).toHaveLength(43);
      expect(JSON.parse(Buffer.from(encoded!, 'base64url').toString('utf8'))).toMatchObject({
        user_id: 'user-a',
        offer_id: 'offer-a',
        destination_id: 'destination-a',
      });
      expect(new URL(body.authorization_url).searchParams.get('state')).toBe(body.state);

      currentUser = 'user-b';
      const complete = await app.inject({
        method: 'POST',
        url: '/offers/offer-a/tracking/google-ads/destinations/destination-a/oauth/complete',
        payload: { code: 'authorization-code', state: body.state },
      });
      expect(complete.statusCode).toBe(409);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      env.TRACKING_ENCRYPTION_KEY = originalKey;
      vi.unstubAllGlobals();
      await app.close();
    }
  });

  it('rejects user B attaching user A connection to user B offer', async () => {
    vi.stubEnv('JWT_SECRET', 'test-only-jwt-secret-at-least-32-characters');
    const { default: routes } = await import('../src/routes/google-ads-oauth.js');
    const connections = new Map([
      ['connection-owned-by-user-a', { user_id: 'user-a', offer_id: 'offer-a' }],
    ]);
    const db = vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = strings.join('?');

      if (
        query.includes('FROM tracking_google_ads_oauth_connections') &&
        query.includes('WHERE id=')
      ) {
        const [connectionId, userId, offerId] = values as string[];
        const connection = connections.get(connectionId);
        return connection?.user_id === userId &&
          (connection.offer_id === null || connection.offer_id === offerId)
          ? [{ id: connectionId }]
          : [];
      }

      if (query.includes('UPDATE tracking_google_ads_destinations')) {
        return query.includes('c.user_id') ? [] : [{ id: 'destination-b' }];
      }

      return [];
    });
    const app = Fastify();
    app.decorate('db', db);
    app.decorate('offerStore', {
      assertManager: vi.fn().mockResolvedValue(undefined),
    });
    app.addHook('preHandler', async (request) => {
      (request as typeof request & { user: { sub: string; role: string } }).user = {
        sub: 'user-b',
        role: 'user',
      };
    });

    try {
      await app.register(routes);
      const response = await app.inject({
        method: 'POST',
        url: '/offers/offer-b/tracking/google-ads/destinations/destination-b/oauth/attach',
        payload: { connection_id: 'connection-owned-by-user-a' },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ error: 'google_oauth_connection_forbidden' });
      expect(
        db.mock.calls.some(([strings]) =>
          (strings as TemplateStringsArray)
            .join('?')
            .includes('UPDATE tracking_google_ads_destinations'),
        ),
      ).toBe(false);
    } finally {
      await app.close();
    }
  });
});
