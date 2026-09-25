import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';

export const GOOGLE_DATA_SCOPE = 'https://www.googleapis.com/auth/datamanager';
export const GOOGLE_ADS_SCOPE = 'https://www.googleapis.com/auth/adwords';
// Identity scopes let the TMX show exactly which Google profile was authorized.
// This avoids a misleading "connected" state when the operator chose a browser
// profile that does not have access to the intended Google Ads accounts.
export const GOOGLE_OAUTH_SCOPES = [GOOGLE_DATA_SCOPE, GOOGLE_ADS_SCOPE, 'openid', 'email'];
const Config = z.object({
  clientId: z.string().min(1), clientSecret: z.string().min(1),
  redirectUri: z.string().url().refine((value) => {
    const url = new URL(value);
    return (url.protocol === 'https:' || (url.protocol === 'http:' && url.hostname === 'localhost')) &&
      !url.username && !url.password && !url.search && !url.hash && url.pathname === '/tracking/google-callback';
  }),
});
export type GoogleOAuthConfig = z.infer<typeof Config>;
// Lazy validation: absent/malformed Google configuration never prevents existing services booting.
export function googleOAuthConfig(): GoogleOAuthConfig | null {
  const result = Config.safeParse({ clientId: process.env.GOOGLE_ADS_OAUTH_CLIENT_ID,
    clientSecret: process.env.GOOGLE_ADS_OAUTH_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_ADS_OAUTH_REDIRECT_URI });
  return result.success ? result.data : null;
}
export const stateHash = (state: string) => createHash('sha256').update(state).digest('hex');
export function beginGoogleOAuth(config: GoogleOAuthConfig) {
  const state = randomBytes(32).toString('base64url');
  const verifier = randomBytes(48).toString('base64url');
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri,
    response_type: 'code', scope: GOOGLE_OAUTH_SCOPES.join(' '), access_type: 'offline', prompt: 'consent',
    state, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' }).toString();
  return { state, verifier, authorization_url: url.toString() };
}
const Token = z.object({ access_token: z.string().min(1), token_type: z.string(),
  refresh_token: z.string().min(1).optional(), scope: z.string().optional() });
export async function exchangeGoogleCode(config: GoogleOAuthConfig, code: string, verifier: string) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret,
      redirect_uri: config.redirectUri, grant_type: 'authorization_code', code, code_verifier: verifier }),
    signal: AbortSignal.timeout(15_000),
  });
  // Never surface upstream bodies: they may contain codes or tokens.
  if (!response.ok) throw new Error('google_oauth_exchange_failed');
  const parsed = Token.safeParse(await response.json());
  if (!parsed.success || !parsed.data.refresh_token || parsed.data.token_type.toLowerCase() !== 'bearer' ||
      !GOOGLE_OAUTH_SCOPES.every(scope => parsed.data.scope?.split(' ').includes(scope))) {
    throw new Error('google_oauth_missing_permission');
  }
  return { accessToken: parsed.data.access_token, refreshToken: parsed.data.refresh_token, scope: parsed.data.scope! };
}

export async function getGoogleAuthorizedEmail(accessToken: string) {
  const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(10_000),
  });
  const body = await response.json().catch(() => null);
  return response.ok && typeof body?.email === 'string' && body.email.includes('@') ? body.email : null;
}
