export const AUTH_URL = 'https://server.utmify.com.br/users/auth';

export interface UtmifyAuthSession {
  token: string;
  payload: Record<string, unknown>;
}

export class UtmifyAuthenticationError extends Error {
  override readonly name = 'UtmifyAuthenticationError';
  constructor(
    public readonly authCode:
      | 'AUTH_HTTP_REJECTED'
      | 'AUTH_TOKEN_MISSING'
      | 'AUTH_TIMEOUT'
      | 'AUTH_ABORTED'
      | 'AUTH_NETWORK'
      | 'AUTH_UNEXPECTED',
    public readonly httpStatus?: number,
    public readonly networkCode?: string,
  ) {
    super(
      authCode === 'AUTH_HTTP_REJECTED'
        ? `Login UTMify recusado (${httpStatus}).`
        : authCode === 'AUTH_TOKEN_MISSING'
          ? 'A UTMify não retornou um token válido.'
          : `Falha segura de autenticação UTMify: ${authCode}.`,
    );
  }
}

export const AUTH_NETWORK_CODES = new Set([
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_SOCKET',
  'CERT_HAS_EXPIRED',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

export async function authenticate(login: string, password: string): Promise<UtmifyAuthSession> {
  let response: Response;
  try {
    response = await fetch(AUTH_URL, {
      headers: { authorization: `Basic ${Buffer.from(`${login}:${password}`).toString('base64')}` },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    const r = error && typeof error === 'object' ? (error as Record<string, unknown>) : {};
    const cause =
      r.cause && typeof r.cause === 'object' ? (r.cause as Record<string, unknown>) : {};
    const code =
      typeof cause.code === 'string' && AUTH_NETWORK_CODES.has(cause.code)
        ? cause.code
        : typeof r.code === 'string' && AUTH_NETWORK_CODES.has(r.code)
          ? r.code
          : undefined;
    const kind =
      r.name === 'TimeoutError'
        ? 'AUTH_TIMEOUT'
        : r.name === 'AbortError'
          ? 'AUTH_ABORTED'
          : code || r.name === 'TypeError'
            ? 'AUTH_NETWORK'
            : 'AUTH_UNEXPECTED';
    // Do not retain cause/message/URL: fetch exceptions may contain credentials.
    throw new UtmifyAuthenticationError(kind, undefined, code);
  }
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) throw new UtmifyAuthenticationError('AUTH_HTTP_REJECTED', response.status);
  const auth = payload?.auth as Record<string, unknown> | undefined;
  const token = auth?.token ?? payload?.token ?? payload?.access_token;
  if (typeof token !== 'string' || !token)
    throw new UtmifyAuthenticationError('AUTH_TOKEN_MISSING', response.status);
  return {
    token: token.replace(/^Bearer\s+/i, '').trim(),
    payload: payload ?? {},
  };
}
