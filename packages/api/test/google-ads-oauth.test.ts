import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { env } from '../src/env.js';
import {
  GOOGLE_ADS_SCOPE,
  GOOGLE_DATA_SCOPE,
  GOOGLE_OAUTH_SCOPES,
  beginGoogleOAuth,
  exchangeGoogleCode,
  googleOAuthConfig,
  stateHash,
} from '../src/integrations/google-ads/oauth.js';
import { decryptSecret } from '../src/lib/secret-box.js';
import routes from '../src/routes/google-ads-oauth.js';

const config = {
  clientId: 'test-client',
  clientSecret: 'server-secret',
  redirectUri: 'https://example.com/tracking/google-callback',
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe('Google OAuth isolation', () => {
  it('does not require Google configuration at boot', () => {
    vi.stubEnv('GOOGLE_ADS_OAUTH_CLIENT_ID', '');
    expect(googleOAuthConfig()).toBeNull();
  });
  it('uses fresh one-use state, PKCE and a server-only client secret', () => {
    const a = beginGoogleOAuth(config);
    const b = beginGoogleOAuth(config);
    expect(a.state).not.toBe(b.state);
    expect(a.verifier).not.toBe(b.verifier);
    const url = new URL(a.authorization_url);
    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.searchParams.get('scope')).toBe(GOOGLE_OAUTH_SCOPES.join(' '));
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(a.authorization_url).not.toContain(config.clientSecret);
    expect(a.authorization_url).not.toContain(a.verifier);
    expect(stateHash(a.state)).toHaveLength(64);
  });
  it('requires a refresh token for a persistent connection', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          access_token: 'secret',
          token_type: 'Bearer',
          scope: GOOGLE_OAUTH_SCOPES.join(' '),
        }),
      ),
    );
    await expect(exchangeGoogleCode(config, 'code', 'verifier')).rejects.toThrow(
      'google_oauth_missing_refresh_token',
    );
  });
  it.each([undefined, 'email', GOOGLE_DATA_SCOPE, GOOGLE_ADS_SCOPE])(
    'rejects incomplete integration scopes: %s',
    async (scope) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          Response.json({
            access_token: 'secret',
            token_type: 'Bearer',
            refresh_token: 'refresh',
            scope,
          }),
        ),
      );
      await expect(exchangeGoogleCode(config, 'code', 'verifier')).rejects.toThrow(
        'google_oauth_missing_permission',
      );
    },
  );
  it.each([
    [400, 'google_oauth_invalid_grant'],
    [401, 'google_oauth_invalid_client'],
    [503, 'google_oauth_exchange_failed'],
  ] as const)(
    'sanitizes upstream status %s without exposing the error body',
    async (status, code) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(new Response('secret-auth-material', { status })),
      );
      await expect(exchangeGoogleCode(config, 'code', 'verifier')).rejects.toMatchObject({
        message: code,
        code,
      });
    },
  );
  it.each([GOOGLE_OAUTH_SCOPES.join(' '), `${GOOGLE_DATA_SCOPE} ${GOOGLE_ADS_SCOPE}`])(
    'returns tokens only to server-side callers with granted scopes: %s',
    async (scope) => {
      const fetchMock = vi.fn().mockResolvedValue(
        Response.json({
          access_token: 'short-lived',
          refresh_token: 'long-lived',
          token_type: 'Bearer',
          scope,
        }),
      );
      vi.stubGlobal('fetch', fetchMock);
      expect(await exchangeGoogleCode(config, 'code', 'verifier')).toEqual({
        accessToken: 'short-lived',
        refreshToken: 'long-lived',
        scope,
      });
      expect(fetchMock.mock.calls[0]?.[0]).toBe('https://oauth2.googleapis.com/token');
    },
  );
  it('keeps tokens off the HTTP response and encrypts the stored refresh token', async () => {
    vi.stubEnv('GOOGLE_ADS_OAUTH_CLIENT_ID', config.clientId);
    vi.stubEnv('GOOGLE_ADS_OAUTH_CLIENT_SECRET', config.clientSecret);
    vi.stubEnv('GOOGLE_ADS_OAUTH_REDIRECT_URI', config.redirectUri);
    const originalKey = env.TRACKING_ENCRYPTION_KEY;
    const encryptionKey = 'test-only-encryption-key-at-least-32-characters';
    env.TRACKING_ENCRYPTION_KEY = encryptionKey;
    let verifierEncrypted = '';
    let refreshTokenEncrypted = '';
    const connectedAt = '2026-10-18T12:00:00.000Z';
    const query = async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join('?');
      if (sql.includes('SELECT d.id FROM tracking_google_ads_destinations')) return [{ id: 'd' }];
      if (sql.includes('INSERT INTO tracking_google_ads_oauth_states'))
        verifierEncrypted = values[3] as string;
      if (sql.includes('DELETE FROM tracking_google_ads_oauth_states s'))
        return [{ verifier_encrypted: verifierEncrypted }];
      if (sql.includes('INSERT INTO tracking_google_ads_oauth_connections')) {
        refreshTokenEncrypted = values[2] as string;
        return [{ id: 'connection-a', name: values[1], connected_at: connectedAt }];
      }
      if (sql.includes('UPDATE tracking_google_ads_destinations')) return [{ id: 'd' }];
      return [];
    };
    query.begin = async (run: (sql: typeof query) => Promise<unknown>) => run(query);
    const app = Fastify();
    app.decorate('db', query);
    app.decorate('offerStore', { assertManager: vi.fn().mockResolvedValue(undefined) });
    app.addHook('preHandler', async (req) => {
      Object.assign(req, { user: { sub: 'manager', role: 'user' } });
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          access_token: 'short-lived',
          refresh_token: 'long-lived',
          token_type: 'Bearer',
          scope: GOOGLE_OAUTH_SCOPES.join(' '),
        }),
      )
      .mockResolvedValueOnce(Response.json({ email: 'operator@example.test' }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      await app.register(routes);
      const start = await app.inject({
        method: 'POST',
        url: '/offers/a/tracking/google-ads/destinations/d/oauth/start',
      });
      expect(start.statusCode).toBe(200);
      const response = await app.inject({
        method: 'POST',
        url: '/offers/a/tracking/google-ads/destinations/d/oauth/complete',
        payload: { code: 'authorization-code', state: start.json().state },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        connected: true,
        connection: {
          id: 'connection-a',
          name: 'Google · operator@example.test',
          connected_at: connectedAt,
        },
        account_validated: false,
        delivery_enabled: false,
      });
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        'https://openidconnect.googleapis.com/v1/userinfo',
        expect.objectContaining({ headers: { authorization: 'Bearer short-lived' } }),
      );
      expect(refreshTokenEncrypted).not.toContain('long-lived');
      expect(decryptSecret(refreshTokenEncrypted, encryptionKey)).toBe('long-lived');
    } finally {
      env.TRACKING_ENCRYPTION_KEY = originalKey;
      await app.close();
    }
  });
  it('requires offer permission before querying state or exchanging tokens', async () => {
    const app = Fastify();
    const denied = async () => {
      throw Object.assign(new Error('forbidden'), { statusCode: 403 });
    };
    app.decorate('offerStore', { assertAccess: denied, assertManager: denied });
    app.addHook('preHandler', async (req) => {
      Object.assign(req, { user: { sub: 'user', role: 'user' } });
    });
    await app.register(routes);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    try {
      for (const suffix of ['start', 'complete']) {
        expect(
          (
            await app.inject({
              method: 'POST',
              url: `/offers/private/tracking/google-ads/destinations/d/oauth/${suffix}`,
            })
          ).statusCode,
        ).toBe(403);
      }
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
  it('rejects expired or consumed state before contacting Google', async () => {
    vi.stubEnv('GOOGLE_ADS_OAUTH_CLIENT_ID', config.clientId);
    vi.stubEnv('GOOGLE_ADS_OAUTH_CLIENT_SECRET', config.clientSecret);
    vi.stubEnv('GOOGLE_ADS_OAUTH_REDIRECT_URI', config.redirectUri);
    const originalKey = env.TRACKING_ENCRYPTION_KEY;
    env.TRACKING_ENCRYPTION_KEY = 'test-only-encryption-key-at-least-32-characters';
    const app = Fastify();
    const db = vi.fn().mockResolvedValue([]);
    app.decorate('db', db);
    app.decorate('offerStore', { assertManager: vi.fn().mockResolvedValue(undefined) });
    app.addHook('preHandler', async (req) => {
      Object.assign(req, { user: { sub: 'manager', role: 'user' } });
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    try {
      await app.register(routes);
      const response = await app.inject({
        method: 'POST',
        url: '/offers/a/tracking/google-ads/destinations/d/oauth/complete',
        payload: { code: 'authorization-code', state: 'a'.repeat(43) },
      });
      expect(response.statusCode).toBe(409);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(db.mock.calls[0]?.slice(1)).toEqual(['a', 'd', 'manager', stateHash('a'.repeat(43))]);
    } finally {
      env.TRACKING_ENCRYPTION_KEY = originalKey;
      await app.close();
    }
  });
});
