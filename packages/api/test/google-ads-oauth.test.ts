import { afterEach, describe, expect, it, vi } from 'vitest';
import { beginGoogleOAuth, exchangeGoogleCode, googleOAuthConfig, GOOGLE_DATA_SCOPE, stateHash } from '../src/integrations/google-ads/oauth.js';
import Fastify from 'fastify';
import routes from '../src/routes/google-ads-oauth.js';
import { env } from '../src/env.js';

const config = { clientId: 'test-client', clientSecret: 'server-secret', redirectUri: 'https://example.com/tracking/google-callback' };
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe('Google OAuth isolation', () => {
  it('does not require Google configuration at boot', () => {
    vi.stubEnv('GOOGLE_ADS_OAUTH_CLIENT_ID', '');
    expect(googleOAuthConfig()).toBeNull();
  });
  it('uses fresh one-use state, PKCE and a server-only client secret', () => {
    const a = beginGoogleOAuth(config), b = beginGoogleOAuth(config);
    expect(a.state).not.toBe(b.state);
    expect(a.verifier).not.toBe(b.verifier);
    const url = new URL(a.authorization_url);
    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.searchParams.get('scope')).toBe(GOOGLE_DATA_SCOPE);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(a.authorization_url).not.toContain(config.clientSecret);
    expect(a.authorization_url).not.toContain(a.verifier);
    expect(stateHash(a.state)).toHaveLength(64);
  });
  it('requires a refresh token and the actual granted scope', async () => {
    for (const body of [
      { access_token: 'secret', token_type: 'Bearer', scope: GOOGLE_DATA_SCOPE },
      { access_token: 'secret', token_type: 'Bearer', refresh_token: 'refresh', scope: 'email' },
    ]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body))));
      await expect(exchangeGoogleCode(config, 'code', 'verifier')).rejects.toThrow('google_oauth_missing_permission');
    }
  });
  it('never exposes upstream errors or tokens in error messages', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('secret-auth-material', { status: 400 })));
    await expect(exchangeGoogleCode(config, 'code', 'verifier')).rejects.toThrow('google_oauth_exchange_failed');
  });
  it('uses the token endpoint only and returns no access token to callers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: 'short-lived', refresh_token: 'long-lived', token_type: 'Bearer', scope: GOOGLE_DATA_SCOPE })));
    vi.stubGlobal('fetch', fetchMock);
    expect(await exchangeGoogleCode(config, 'code', 'verifier')).toEqual({ refreshToken: 'long-lived', scope: GOOGLE_DATA_SCOPE });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://oauth2.googleapis.com/token');
  });
  it('requires offer permission before querying state or exchanging tokens', async () => {
    const app = Fastify();
    const denied = async () => { throw Object.assign(new Error('forbidden'), { statusCode: 403 }); };
    app.decorate('offerStore', { assertAccess: denied, assertManager: denied });
    app.addHook('preHandler', async req => { (req as any).user = { sub: 'user', role: 'user' }; });
    await app.register(routes);
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    try {
      for (const suffix of ['start', 'complete']) {
        expect((await app.inject({ method: 'POST', url: `/offers/private/tracking/google-ads/destinations/d/oauth/${suffix}` })).statusCode).toBe(403);
      }
      expect(fetchMock).not.toHaveBeenCalled();
    } finally { await app.close(); }
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
    app.addHook('preHandler', async req => { (req as any).user = { sub: 'manager', role: 'user' }; });
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    try {
      await app.register(routes);
      const response = await app.inject({ method: 'POST', url: '/offers/a/tracking/google-ads/destinations/d/oauth/complete',
        payload: { code: 'authorization-code', state: 'a'.repeat(43) } });
      expect(response.statusCode).toBe(409);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(db.mock.calls[0]?.slice(1)).toEqual(['a', 'd', 'manager', stateHash('a'.repeat(43))]);
    } finally { env.TRACKING_ENCRYPTION_KEY = originalKey; await app.close(); }
  });
});
