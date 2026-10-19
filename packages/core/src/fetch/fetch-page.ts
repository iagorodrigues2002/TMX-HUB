import type { FetchOptions, FetchResult } from '../types.js';
import { withContext } from './browser-pool.js';
import { detectChallenge } from './escalation.js';
import { assertPublicUrl, publicRequest as request } from './public-network.js';

const DEFAULT_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const DEFAULT_VIEWPORT = { width: 1440, height: 900 };
const DEFAULT_TIMEOUT_MS = 30_000;

export async function fetchPage(url: string, opts: FetchOptions = {}): Promise<FetchResult> {
  await assertPublicUrl(url);
  opts.signal?.throwIfAborted();
  const mode = opts.renderMode ?? 'js';
  if (mode === 'static') return fetchStatic(url, opts);
  return fetchWithBrowser(url, opts);
}

async function fetchStatic(url: string, opts: FetchOptions): Promise<FetchResult> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const signal = opts.signal ? AbortSignal.any([opts.signal, ac.signal]) : ac.signal;
  try {
    const res = await request(url, {
      method: 'GET',
      signal,
      headers: {
        'user-agent': opts.userAgent ?? DEFAULT_UA,
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        ...(opts.extraHttpHeaders ?? {}),
      },
    });
    const chunks: Buffer[] = [];
    let bytes = 0;
    for await (const c of res.body) {
      const chunk = Buffer.isBuffer(c) ? c : Buffer.from(c);
      bytes += chunk.length;
      if (bytes > 5 * 1024 * 1024) {
        ac.abort();
        throw Object.assign(new Error('Page exceeds 5 MiB.'), { code: 'too_large' });
      }
      chunks.push(chunk);
    }
    const html = Buffer.concat(chunks).toString('utf8');
    const headers = flattenHeaders(res.headers);
    const titleMatch = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
    const title = titleMatch?.[1] ?? '';
    const challenge = detectChallenge({ title, html, statusCode: res.statusCode });
    return {
      html,
      finalUrl: res.finalUrl,
      statusCode: res.statusCode,
      headers,
      detectedChallenge: challenge,
      renderedAt: new Date().toISOString(),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithBrowser(url: string, opts: FetchOptions): Promise<FetchResult> {
  const viewport = opts.viewport ?? DEFAULT_VIEWPORT;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const userAgent = opts.userAgent ?? DEFAULT_UA;

  return withContext(
    {
      userAgent,
      viewport,
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
      locale: 'en-US',
      extraHTTPHeaders: opts.extraHttpHeaders,
      ignoreHTTPSErrors: false,
    },
    async (ctx) => {
      const abort = () => {
        void ctx.close().catch(() => undefined);
      };
      opts.signal?.addEventListener('abort', abort, { once: true });
      if (opts.signal?.aborted) {
        abort();
        opts.signal.throwIfAborted();
      }
      const page = await ctx.newPage();
      page.setDefaultTimeout(timeoutMs);
      page.setDefaultNavigationTimeout(timeoutMs);

      let lastResponseStatus = 0;
      page.on('response', (resp) => {
        if (resp.url() === url || resp.request().isNavigationRequest()) {
          lastResponseStatus = resp.status();
        }
      });

      const overallTimer = setTimeout(() => {
        page
          .context()
          .close()
          .catch(() => undefined);
      }, timeoutMs + 5_000);

      try {
        const navResponse = await page.goto(url, {
          waitUntil: opts.waitFor ?? 'networkidle',
          timeout: timeoutMs,
        });
        const status = navResponse?.status() ?? lastResponseStatus ?? 0;
        const finalUrl = page.url();
        const html = await page.content();
        opts.signal?.throwIfAborted();
        if (Buffer.byteLength(html) > 5 * 1024 * 1024) {
          throw Object.assign(new Error('Page exceeds 5 MiB.'), { code: 'too_large' });
        }
        const title = await page.title().catch(() => '');
        const headers = navResponse ? await navResponse.allHeaders() : {};
        const challenge = detectChallenge({ title, html, statusCode: status });
        return {
          html,
          finalUrl,
          statusCode: status,
          headers,
          detectedChallenge: challenge,
          renderedAt: new Date().toISOString(),
        };
      } finally {
        opts.signal?.removeEventListener('abort', abort);
        clearTimeout(overallTimer);
        await page.close().catch(() => undefined);
      }
    },
  );
}

function flattenHeaders(
  headers: Record<string, string | string[] | undefined>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (typeof v === 'string') out[k] = v;
    else if (Array.isArray(v) && typeof v[0] === 'string') out[k] = v[0];
  }
  return out;
}
