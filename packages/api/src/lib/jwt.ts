import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Tiny HS256 JWT impl — avoids the `jsonwebtoken` dep. Good enough for our
 * use case (single trusted issuer, short tokens, no nested JWS).
 */

function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(input: string): Buffer {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

export interface JwtPayload {
  sub: string; // user id
  email: string;
  role: 'admin' | 'user';
  iat: number;
  exp: number;
}

export function signJwt(
  payload: Omit<JwtPayload, 'iat' | 'exp'>,
  secret: string,
  ttlSeconds = 60 * 60 * 24 * 14, // 14 days
): { token: string; payload: JwtPayload } {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const full: JwtPayload = { ...payload, iat: now, exp: now + ttlSeconds };
  const headerEnc = base64UrlEncode(JSON.stringify(header));
  const payloadEnc = base64UrlEncode(JSON.stringify(full));
  const data = `${headerEnc}.${payloadEnc}`;
  const sig = createHmac('sha256', secret).update(data).digest();
  return { token: `${data}.${base64UrlEncode(sig)}`, payload: full };
}

export function verifyJwt(token: string, secret: string): JwtPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerEnc, payloadEnc, sigEnc] = parts as [string, string, string];
  const expected = createHmac('sha256', secret).update(`${headerEnc}.${payloadEnc}`).digest();
  const provided = base64UrlDecode(sigEnc);
  if (provided.length !== expected.length) return null;
  if (!timingSafeEqual(provided, expected)) return null;
  try {
    const payload = JSON.parse(base64UrlDecode(payloadEnc).toString('utf8')) as JwtPayload;
    if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
