import { lookup } from 'node:dns';
import { isIP } from 'node:net';
import type { BrowserContext } from 'playwright';
import { Agent, request, fetch as undiciFetch } from 'undici';

export function isPublicAddress(address: string): boolean {
  let ip = address.toLowerCase().replace(/^\[|\]$/g, '');
  if (isIP(ip) === 6 && !ip.includes('%')) {
    ip = new URL(`http://[${ip}]`).hostname.slice(1, -1);
  }
  if (isIP(ip) === 4) {
    const [a = 0, b = 0, c = 0] = ip.split('.').map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113)
    );
  }
  if (isIP(ip) !== 6 || ip.includes('%')) return false;
  // Fail closed outside global unicast; includes mapped IPv4/link-local/ULA.
  const first = Number.parseInt(ip.split(':')[0]!, 16);
  const second = Number.parseInt(ip.split(':')[1] || '0', 16);
  return (
    first >= 0x2000 &&
    first <= 0x3fff &&
    first !== 0x3fff &&
    first !== 0x2002 &&
    !(first === 0x2001 && (second < 0x0200 || second === 0x0db8))
  );
}

export function publicHttpUrl(raw: string | URL): URL {
  const url = new URL(raw);
  const host = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    host.toLowerCase() === 'localhost' ||
    host.toLowerCase().endsWith('.localhost') ||
    (isIP(host) !== 0 && !isPublicAddress(host))
  ) {
    throw new Error('Destination must be a public HTTP(S) URL.');
  }
  return url;
}

/** Connection-time lookup: the address checked is the address given to TCP. */
export function createPublicLookup(resolver: typeof lookup = lookup): typeof lookup {
  return ((
    hostname: string,
    _options: unknown,
    callback: (error: Error | null, address?: string, family?: number) => void,
  ) => {
    resolver(hostname, { all: true, verbatim: true }, (error, addresses) => {
      if (error) return callback(error);
      if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
        return callback(new Error('Destination resolves to a non-public address.'));
      }
      callback(null, addresses[0]!.address, addresses[0]!.family);
    });
  }) as typeof lookup;
}

const checkedLookup = createPublicLookup();

const dispatcher = new Agent({
  connect: { lookup: checkedLookup, autoSelectFamily: false },
  headersTimeout: 30_000,
  bodyTimeout: 30_000,
});

/** Preflight for transports that cannot use the checked dispatcher. */
export async function assertPublicUrl(raw: string): Promise<void> {
  const url = publicHttpUrl(raw);
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(hostname)) return;
  await new Promise<void>((resolve, reject) => {
    checkedLookup(hostname, {}, (error) => (error ? reject(error) : resolve()));
  });
}

// Used only by user-URL tools, never by financial delivery/provider workers.
export async function publicRequest(
  raw: string,
  options: NonNullable<Parameters<typeof request>[1]> = {},
) {
  let url = publicHttpUrl(raw);
  let init = options;
  for (let redirects = 0; ; redirects += 1) {
    // This Agent has no redirect interceptor; request() returns each hop.
    const response = await request(url, { ...init, dispatcher });
    if (![301, 302, 303, 307, 308].includes(response.statusCode) || !response.headers.location)
      return { ...response, finalUrl: url.href };
    response.body.destroy();
    if (redirects >= 5) throw new Error('Too many redirects.');
    const next = publicHttpUrl(new URL(String(response.headers.location), url));
    // Avoid leaking credentials/headers across origins through this tool helper.
    if (next.origin !== url.origin && init.headers) {
      const headers = { ...init.headers } as Record<string, string>;
      for (const name of Object.keys(headers)) {
        if (
          ['authorization', 'cookie', 'proxy-authorization', 'host'].includes(name.toLowerCase())
        ) {
          delete headers[name];
        }
      }
      init = { ...init, headers };
    }
    if (
      response.statusCode === 303 ||
      ((response.statusCode === 301 || response.statusCode === 302) && init.method === 'POST')
    ) {
      init = { ...init, method: 'GET', body: undefined };
    }
    url = next;
  }
}

export async function publicFetch(raw: string, options: RequestInit = {}): Promise<Response> {
  let url = publicHttpUrl(raw);
  let init = options;
  for (let redirects = 0; ; redirects += 1) {
    const response = await undiciFetch(url, {
      ...init,
      dispatcher,
      redirect: 'manual',
    } as Parameters<typeof undiciFetch>[1]);
    if (
      ![301, 302, 303, 307, 308].includes(response.status) ||
      !response.headers.has('location') ||
      init.redirect === 'manual'
    ) {
      return response as unknown as Response;
    }
    await response.body?.cancel();
    if (init.redirect === 'error' || redirects >= 5) throw new Error('Redirect not allowed.');
    const next = publicHttpUrl(new URL(response.headers.get('location')!, url));
    const headers = new Headers(init.headers);
    if (next.origin !== url.origin) {
      for (const name of ['authorization', 'cookie', 'proxy-authorization', 'host'])
        headers.delete(name);
    }
    if (
      (response.status === 303 &&
        !['GET', 'HEAD'].includes((init.method ?? 'GET').toUpperCase())) ||
      ((response.status === 301 || response.status === 302) &&
        (init.method ?? 'GET').toUpperCase() === 'POST')
    ) {
      init = { ...init, method: 'GET', body: undefined };
      for (const name of ['content-type', 'content-length']) headers.delete(name);
    }
    init = { ...init, headers };
    url = next;
  }
}

/** Defense in depth; the public proxy also checks connection-time IPs. */
export async function guardBrowserContext(context: BrowserContext): Promise<void> {
  await context.route('**/*', async (route) => {
    try {
      await assertPublicUrl(route.request().url());
      await route.continue();
    } catch {
      await route.abort('blockedbyclient').catch(() => undefined);
    }
  });
  await context.routeWebSocket('**/*', (socket) => socket.close());
}
