import type { Browser, BrowserContext, Page, Request, Response } from 'playwright';
import type { VslManifestKind } from '@page-cloner/shared';
import { getBrowser } from '../fetch/browser-pool.js';

export interface DetectOptions {
  /** Wall clock cap for the whole detection run (ms). Default 90s. */
  timeoutMs?: number;
  /** Override locale fingerprint. Default pt-BR. */
  locale?: string;
  /** Override geo timezone. Default America/Sao_Paulo. */
  timezone?: string;
  /** Override user-agent. Default: realistic Chrome on Mac. */
  userAgent?: string;
  /** Override viewport. Default 1366x768 (most common desktop). */
  viewport?: { width: number; height: number };
  /** Spoof Referer/UTM as if the visitor clicked a Facebook ad. Default true. */
  spoofAdClick?: boolean;
  /** Logger hook. */
  onLog?: (msg: string) => void;
}

export interface DetectResult {
  manifestUrl: string;
  manifestKind: VslManifestKind;
  /** Page URL after any redirects (useful when the input was a funnel link). */
  finalPageUrl: string;
  /** Headers the manifest was fetched with — needed by ffmpeg for protected CDNs. */
  headers: Record<string, string>;
  /** Other media URLs we observed (for debugging / fallback). */
  observed: Array<{ url: string; kind: VslManifestKind }>;
}

// Canonical realistic UA. Pinned to a recent stable Chrome on macOS — least
// likely to be flagged as automation by generic cloakers.
const DEFAULT_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

function classifyMedia(u: string): VslManifestKind | null {
  // Strip query so foo.m3u8?token=... is still detected.
  const path = u.split('?')[0]?.toLowerCase() ?? u.toLowerCase();
  if (path.endsWith('.m3u8')) return 'hls';
  if (path.endsWith('.mpd')) return 'dash';
  if (path.endsWith('.mp4') || path.endsWith('.m4v')) return 'mp4';
  // Some HLS variants come with explicit content-type rather than extension.
  return null;
}

function classifyByContentType(ct: string | undefined): VslManifestKind | null {
  if (!ct) return null;
  const c = ct.toLowerCase();
  if (c.includes('mpegurl') || c.includes('vnd.apple.mpegurl')) return 'hls';
  if (c.includes('dash+xml')) return 'dash';
  // We intentionally do NOT classify mp4 by content-type — too many tracking
  // pixels and previews come back as video/mp4 and would create false hits.
  return null;
}

function pickBest(observed: Array<{ url: string; kind: VslManifestKind }>) {
  // Strong preference: HLS > DASH > MP4. HLS is what nearly every VSL player
  // (VTURB, Panda, Vidalytics, etc.) uses for the actual asset.
  const hls = observed.find((o) => o.kind === 'hls');
  if (hls) return hls;
  const dash = observed.find((o) => o.kind === 'dash');
  if (dash) return dash;
  return observed.find((o) => o.kind === 'mp4');
}

async function humanize(page: Page, log: (s: string) => void): Promise<void> {
  // Move the mouse in a few steps + small scrolls so behavior-based filters
  // see something other than "page loaded, no interaction, leave".
  try {
    await page.mouse.move(120, 200, { steps: 8 });
    await page.waitForTimeout(350);
    await page.mouse.move(540, 380, { steps: 12 });
    await page.waitForTimeout(450);
    await page.evaluate(() => window.scrollTo({ top: 200, behavior: 'smooth' }));
    await page.waitForTimeout(600);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    await page.waitForTimeout(300);
    log('humanized: mouse + scroll');
  } catch (err) {
    log(`humanize skipped: ${(err as Error).message}`);
  }
}

async function attemptVideoStart(page: Page, log: (s: string) => void): Promise<void> {
  // Many VSL players gate the manifest behind a click on the player itself
  // (autoplay+sound is blocked by browsers). Try to click the most common
  // play-button selectors, falling back to clicking the center of the largest
  // <video>/<iframe>/<div> element on the page.
  try {
    const candidates = [
      '.vjs-big-play-button',
      'button[aria-label*="play" i]',
      'button[title*="play" i]',
      '.smartplayer-poster',
      '.true-play-button',
      '.vsl-play-overlay',
      '[data-testid="play-button"]',
    ];
    for (const sel of candidates) {
      const el = await page.$(sel);
      if (el) {
        await el.click({ delay: 50 }).catch(() => undefined);
        log(`clicked candidate: ${sel}`);
        return;
      }
    }
    // Fallback: click center of the largest visual rect (likely the player)
    const box = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll<HTMLElement>('video, iframe, [class*=player i], [id*=player i]'));
      let best: { x: number; y: number; w: number; h: number } | null = null;
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (r.width < 200 || r.height < 100) continue;
        if (!best || r.width * r.height > best.w * best.h) {
          best = { x: r.left, y: r.top, w: r.width, h: r.height };
        }
      }
      return best;
    });
    if (box) {
      await page.mouse.click(box.x + box.w / 2, box.y + box.h / 2, { delay: 80 });
      log(`clicked player rect at (${Math.round(box.x + box.w / 2)},${Math.round(box.y + box.h / 2)})`);
    }
  } catch (err) {
    log(`attemptVideoStart skipped: ${(err as Error).message}`);
  }
}

export async function detectVideoManifest(
  rawUrl: string,
  opts: DetectOptions = {},
): Promise<DetectResult> {
  const log = opts.onLog ?? (() => undefined);
  const timeoutMs = opts.timeoutMs ?? 90_000;
  const locale = opts.locale ?? 'pt-BR';
  const timezone = opts.timezone ?? 'America/Sao_Paulo';
  const userAgent = opts.userAgent ?? DEFAULT_UA;
  const viewport = opts.viewport ?? { width: 1366, height: 768 };

  // Spoofed query params + referer to look like a Facebook-ad click. Skipped
  // if the URL already has fbclid (means the user is intentionally testing
  // a real ad link).
  let url = rawUrl;
  if (opts.spoofAdClick !== false) {
    try {
      const u = new URL(rawUrl);
      if (!u.searchParams.has('fbclid')) {
        u.searchParams.set('fbclid', `IwAR0${Math.random().toString(36).slice(2, 18)}`);
      }
      url = u.toString();
    } catch {
      // not a valid URL — let Playwright surface the navigation error
    }
  }
  log(`url after spoof: ${url}`);

  const browser: Browser = await getBrowser();
  const ctx: BrowserContext = await browser.newContext({
    userAgent,
    viewport,
    deviceScaleFactor: 2,
    isMobile: false,
    hasTouch: false,
    locale,
    timezoneId: timezone,
    permissions: [],
    extraHTTPHeaders: {
      'accept-language': `${locale},pt;q=0.9,en;q=0.8`,
      // Helps with cloakers that reject empty Sec-CH-UA.
      'sec-ch-ua': '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"macOS"',
      // Pretend we came from Facebook so the cloaker thinks we're paid traffic.
      ...(opts.spoofAdClick !== false ? { referer: 'https://l.facebook.com/' } : {}),
    },
    ignoreHTTPSErrors: true,
  });

  // Final layer of fingerprint patching that playwright-extra-plugin-stealth
  // doesn't already cover — most cloakers check these first.
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'languages', { get: () => ['pt-BR', 'pt', 'en'] });
    Object.defineProperty(navigator, 'plugins', {
      get: () => [
        { name: 'PDF Viewer', filename: 'internal-pdf-viewer' },
        { name: 'Chrome PDF Viewer', filename: 'internal-pdf-viewer' },
        { name: 'Chromium PDF Viewer', filename: 'internal-pdf-viewer' },
      ],
    });
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
    Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
    // window.chrome shim
    (window as unknown as { chrome: object }).chrome = { runtime: {} };
  });

  const observed: Array<{ url: string; kind: VslManifestKind }> = [];
  const headersByUrl = new Map<string, Record<string, string>>();

  const page = await ctx.newPage();
  page.setDefaultTimeout(timeoutMs);
  page.setDefaultNavigationTimeout(timeoutMs);

  const onRequest = (req: Request) => {
    const u = req.url();
    const k = classifyMedia(u);
    if (!k) return;
    if (!observed.some((o) => o.url === u)) {
      observed.push({ url: u, kind: k });
      headersByUrl.set(u, req.headers());
      log(`observed [${k}]: ${u}`);
    }
  };
  const onResponse = (resp: Response) => {
    const u = resp.url();
    if (observed.some((o) => o.url === u)) return;
    const k = classifyByContentType(resp.headers()['content-type']);
    if (!k) return;
    observed.push({ url: u, kind: k });
    headersByUrl.set(u, resp.request().headers());
    log(`observed via content-type [${k}]: ${u}`);
  };

  page.on('request', onRequest);
  page.on('response', onResponse);

  let finalPageUrl = url;
  try {
    log(`navigating to ${url}`);
    const nav = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    finalPageUrl = page.url();
    log(`landed on ${finalPageUrl} (status=${nav?.status() ?? 'n/a'})`);

    // Quick check: did we already get a manifest before we even interacted?
    const earlyHit = pickBest(observed);
    if (!earlyHit) {
      await humanize(page, log);
      await attemptVideoStart(page, log);
      // Wait up to 25s after interaction for the manifest request to fire.
      const deadline = Date.now() + 25_000;
      while (Date.now() < deadline) {
        if (pickBest(observed)) break;
        await page.waitForTimeout(500);
      }
    }

    // Last shot: wait for `networkidle` briefly so any deferred manifest gets
    // a chance to load. Bounded so we don't hang on infinite analytics polls.
    if (!pickBest(observed)) {
      await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => undefined);
    }
  } finally {
    page.off('request', onRequest);
    page.off('response', onResponse);
    await ctx.close().catch(() => undefined);
  }

  const best = pickBest(observed);
  if (!best) {
    throw Object.assign(new Error('No video manifest detected on the page.'), {
      code: 'manifest_not_found',
    });
  }

  return {
    manifestUrl: best.url,
    manifestKind: best.kind,
    finalPageUrl,
    headers: headersByUrl.get(best.url) ?? {},
    observed,
  };
}
