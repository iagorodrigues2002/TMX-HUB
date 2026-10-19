import type { Problem } from '@page-cloner/shared';
import { env } from '../env.js';
import { ApiError } from '../query-client.js';

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export const TOKEN_STORAGE_KEY = 'tmx-hub:auth-token';

export const TOKEN_COOKIE_KEY = 'tmx_hub_auth_token';

export let volatileAuthToken: string | null = null;

export function authCookie(): string | null {
  if (typeof document === 'undefined') return null;
  try {
    const raw = document.cookie
      .split('; ')
      .find((entry) => entry.startsWith(`${TOKEN_COOKIE_KEY}=`))
      ?.slice(TOKEN_COOKIE_KEY.length + 1);
    return raw ? decodeURIComponent(raw) : null;
  } catch {
    return null;
  }
}

export const authToken = {
  get(): string | null {
    if (typeof window === 'undefined') return null;
    if (volatileAuthToken) return volatileAuthToken;
    try {
      const persisted = window.localStorage.getItem(TOKEN_STORAGE_KEY);
      if (persisted) {
        volatileAuthToken = persisted;
        return persisted;
      }
    } catch {
      // Mobile/private browsers may block localStorage. Continue through the
      // session and cookie fallbacks instead of silently losing the login.
    }
    try {
      const session = window.sessionStorage.getItem(TOKEN_STORAGE_KEY);
      if (session) {
        volatileAuthToken = session;
        return session;
      }
    } catch {
      // Cookie fallback below.
    }
    volatileAuthToken = authCookie();
    return volatileAuthToken;
  },
  set(token: string): void {
    if (typeof window === 'undefined') return;
    volatileAuthToken = token;
    try {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } catch {
      // Session/cookie fallbacks keep mobile authentication working.
    }
    try {
      window.sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
    } catch {
      // Cookie fallback below.
    }
    try {
      document.cookie = `${TOKEN_COOKIE_KEY}=${encodeURIComponent(token)}; Path=/; Max-Age=1209600; Secure; SameSite=Lax`;
    } catch {
      // The in-memory token still authenticates the current app session.
    }
  },
  clear(): void {
    if (typeof window === 'undefined') return;
    volatileAuthToken = null;
    try {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    } catch {
      // ignore
    }
    try {
      window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    } catch {
      // ignore
    }
    try {
      document.cookie = `${TOKEN_COOKIE_KEY}=; Path=/; Max-Age=0; Secure; SameSite=Lax`;
    } catch {
      // ignore
    }
  },
};

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  // Browsers always use the TMX origin and Next.js proxies /v1 to the API.
  // This avoids exposing the Railway hostname to DNS filters, privacy
  // extensions and corporate networks, and removes CORS from the login path.
  // Server-side calls still need the absolute configured API URL.
  const baseUrl = typeof window !== 'undefined' ? '' : env.NEXT_PUBLIC_API_URL;
  const url = `${baseUrl}${path}`;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...opts.headers,
  };
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  // Inject auth token automatically when present.
  const token = authToken.get();
  if (token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
      cache: 'no-store',
    });
  } catch (err) {
    // The browser's "Failed to fetch" is opaque. Try to surface the real cause:
    // CORS, mixed content, DNS, offline, etc. — and always include the URL.
    const cause = (err as Error)?.message || 'unknown error';
    const pageOrigin = typeof window !== 'undefined' ? window.location.origin : 'server';
    const pageProto = typeof window !== 'undefined' ? window.location.protocol : 'unknown:';
    let apiProto = 'unknown:';
    try {
      apiProto = baseUrl ? new URL(baseUrl).protocol : pageProto;
    } catch {
      // ignore — env validates URL at boot, but be defensive.
    }
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;

    let hint = '';
    if (offline) {
      hint = ' (browser is offline)';
    } else if (pageProto === 'https:' && apiProto === 'http:') {
      hint = ' (mixed content blocked: page is HTTPS but API URL is HTTP)';
    } else if (cause.toLowerCase().includes('failed to fetch')) {
      hint = ' (CORS, DNS failure, API down, or unreachable)';
    }

    const fullMsg =
      `Falha ao chamar a API: ${cause}${hint}` +
      `\n  URL: ${opts.method ?? 'GET'} ${url}` +
      `\n  Origem: ${pageOrigin}` +
      `\n  API base: ${baseUrl || pageOrigin}`;

    if (typeof console !== 'undefined') {
      console.error('[api-client] request failed', {
        method: opts.method ?? 'GET',
        url,
        baseUrl,
        pageOrigin,
        offline,
        cause,
        error: err,
      });
    }

    throw new ApiError(fullMsg, 0);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const text = await res.text();
  const json = text ? safeJsonParse(text) : null;

  if (!res.ok) {
    const problem = json as Problem | null;
    const message = problem?.detail ?? problem?.title ?? `HTTP ${res.status}`;
    throw new ApiError(message, res.status, problem);
  }

  return json as T;
}

export function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
