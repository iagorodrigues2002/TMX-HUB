import type { VslManifestKind } from '@page-cloner/shared';
import type { Browser, BrowserContext, Request, Response } from 'playwright';
import { getBrowser } from '../fetch/browser-pool.js';
import { assertPublicUrl, guardBrowserContext } from '../fetch/public-network.js';

import type { DetectOptions, DetectResult, ObservedMedia } from './detect.types.js';
import {
  classifyByBody,
  classifyByContentType,
  classifyByExtension,
  pickBest,
} from './media-classification.js';
import { attemptVideoStart, humanize } from './player-interaction.js';
export type { DetectOptions, DetectResult, ObservedMedia } from './detect.types.js';

const DEFAULT_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

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

  // Resolve trafficMode (default: paid). spoofAdClick is the legacy boolean.
  const trafficMode: 'paid' | 'organic' =
    opts.trafficMode ?? (opts.spoofAdClick === false ? 'organic' : 'paid');

  let url = rawUrl;
  try {
    const u = new URL(rawUrl);
    if (trafficMode === 'paid') {
      if (!u.searchParams.has('fbclid')) {
        u.searchParams.set('fbclid', `IwAR0${Math.random().toString(36).slice(2, 18)}`);
      }
    } else {
      // organic: strip every known ad-attribution param
      for (const p of [
        'fbclid',
        'gclid',
        'twclid',
        'msclkid',
        'ttclid',
        'wbraid',
        'gbraid',
        'yclid',
      ]) {
        u.searchParams.delete(p);
      }
      for (const p of [...u.searchParams.keys()]) {
        if (p.startsWith('utm_')) u.searchParams.delete(p);
      }
    }
    url = u.toString();
  } catch {
    // not a valid URL — let Playwright surface the navigation error
  }
  log(`url after trafficMode=${trafficMode}: ${url}`);

  const browser: Browser = await getBrowser();
  await assertPublicUrl(url);
  const ctx: BrowserContext = await browser.newContext({
    serviceWorkers: 'block',
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
      'sec-ch-ua': '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"macOS"',
      ...(trafficMode === 'paid' ? { referer: 'https://l.facebook.com/' } : {}),
    },
    ignoreHTTPSErrors: true,
  });

  await guardBrowserContext(ctx);
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
    (window as unknown as { chrome: object }).chrome = { runtime: {} };
  });

  const observed: ObservedMedia[] = [];
  const headersByUrl = new Map<string, Record<string, string>>();
  const seenUrls = new Set<string>();

  const recordMedia = (
    u: string,
    kind: ObservedMedia['kind'],
    source: ObservedMedia['source'],
    headers?: Record<string, string>,
  ) => {
    if (seenUrls.has(u)) return;
    seenUrls.add(u);
    observed.push({ url: u, kind, source });
    if (headers) headersByUrl.set(u, headers);
    log(`observed [${kind} via ${source}]: ${u.slice(0, 200)}`);
  };

  const page = await ctx.newPage();
  page.setDefaultTimeout(timeoutMs);
  page.setDefaultNavigationTimeout(timeoutMs);

  const onRequest = (req: Request) => {
    const u = req.url();
    const k = classifyByExtension(u);
    if (!k) return;
    recordMedia(u, k, 'extension', req.headers());
  };

  const onResponse = async (resp: Response) => {
    const u = resp.url();
    if (seenUrls.has(u)) return;

    // 1) Content-type header
    const ct = resp.headers()['content-type'];
    const ctKind = classifyByContentType(ct);
    if (ctKind) {
      recordMedia(u, ctKind, 'content-type', resp.request().headers());
      return;
    }

    // 2) Body sniff — only for small text-like responses to avoid pulling
    // multi-MB payloads. Manifests are tiny (<1MB) and text/plain.
    const len = Number.parseInt(resp.headers()['content-length'] ?? '', 10);
    if (Number.isFinite(len) && len > 1024 * 1024) return; // skip > 1MB
    if (
      ct &&
      !ct.includes('text') &&
      !ct.includes('application/octet-stream') &&
      !ct.includes('json') &&
      !ct.includes('xml')
    ) {
      return; // only sniff plausibly-text bodies
    }
    try {
      const buf = await resp.body();
      if (buf.length > 1024 * 1024) return;
      const sniffed = classifyByBody(buf.toString('utf8'));
      if (sniffed) {
        recordMedia(u, sniffed, 'body-sniff', resp.request().headers());
      }
    } catch {
      // body() can fail for redirects / aborted responses — ignore
    }
  };

  page.on('request', onRequest);
  page.on('response', (r) => {
    void onResponse(r);
  });

  let finalPageUrl = url;
  try {
    log(`navigating to ${url}`);
    const nav = await page.goto(url, { waitUntil: 'load', timeout: timeoutMs });
    finalPageUrl = page.url();
    log(`landed on ${finalPageUrl} (status=${nav?.status() ?? 'n/a'})`);

    // Wait briefly for iframes to attach + start loading
    await page.waitForTimeout(2_000);

    if (!pickBest(observed)) {
      await humanize(page, log);
      await attemptVideoStart(page, log);

      // Wait up to 40s for a manifest. Many VSL players have intentional
      // delays (analytics, "wait for first paint", etc.).
      const deadline = Date.now() + 40_000;
      while (Date.now() < deadline) {
        if (pickBest(observed)) break;
        await page.waitForTimeout(500);
      }

      // Last attempt: any new iframes that appeared after the click?
      if (!pickBest(observed)) {
        log('no manifest yet — re-clicking newly-attached frames');
        await attemptVideoStart(page, log);
        const deadline2 = Date.now() + 15_000;
        while (Date.now() < deadline2) {
          if (pickBest(observed)) break;
          await page.waitForTimeout(500);
        }
      }
    }

    if (!pickBest(observed)) {
      await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => undefined);
    }
  } finally {
    page.off('request', onRequest);
    await ctx.close().catch(() => undefined);
  }

  const best = pickBest(observed);
  if (!best || (best.kind !== 'hls' && best.kind !== 'dash' && best.kind !== 'mp4')) {
    // Build a diagnostic message that includes what we saw — even segments
    // are useful clues for the user (they tell us a player did load).
    const sample = observed.slice(0, 8).map((o) => `[${o.kind}] ${o.url.slice(0, 150)}`);
    const detail =
      sample.length > 0
        ? `Observamos ${observed.length} URLs de mídia mas nenhum manifest. Amostra:\n${sample.join('\n')}`
        : 'Nenhuma URL de mídia foi observada — o player pode não ter carregado.';
    throw Object.assign(new Error(`No video manifest detected on the page. ${detail}`), {
      code: 'manifest_not_found',
      observed,
    });
  }

  return {
    manifestUrl: best.url,
    manifestKind: best.kind as VslManifestKind,
    finalPageUrl,
    headers: headersByUrl.get(best.url) ?? {},
    observed,
  };
}

// ----------------------------------------------------------------------------
// Cloaker-aware detection: run two probes (paid + organic) in parallel and
// compare the manifests. If they differ, there's a cloaker (typical VSL
// "white" + "black" setup where paid traffic gets the real video and direct
// visits get a sanitized version).
// ----------------------------------------------------------------------------

export interface DetectCloakerResult {
  /** True when paid and organic visits resolve to *different* manifests. */
  cloakerDetected: boolean;
  /** The paid-traffic manifest (i.e., what real ad clicks see). May be missing if that probe failed. */
  black?: DetectResult;
  /** The organic/clean manifest (i.e., what FB reviewers / bots see). May be missing if that probe failed. */
  white?: DetectResult;
  /** When both probes succeed but resolve to the same manifest, we expose it here. */
  shared?: DetectResult;
  /** First non-null error, for diagnostic purposes. */
  errors: { paid?: string; organic?: string };
}

function manifestKey(r: DetectResult): string {
  // Compare by URL without query (token/timestamps differ between fetches).
  try {
    const u = new URL(r.manifestUrl);
    return `${u.origin}${u.pathname}`;
  } catch {
    return r.manifestUrl;
  }
}

/**
 * Detect both the paid-traffic ("black") and organic ("white") versions of
 * a VSL. Both probes run in parallel — total wall time is bounded by the
 * slowest one (usually ~30-60s on a healthy page).
 */
export async function detectBothManifests(
  rawUrl: string,
  opts: DetectOptions = {},
): Promise<DetectCloakerResult> {
  const log = opts.onLog ?? (() => undefined);
  log('cloaker probe: launching paid + organic detections');

  const [paidR, organicR] = await Promise.allSettled([
    detectVideoManifest(rawUrl, { ...opts, trafficMode: 'paid' }),
    detectVideoManifest(rawUrl, { ...opts, trafficMode: 'organic' }),
  ]);

  const black = paidR.status === 'fulfilled' ? paidR.value : undefined;
  const white = organicR.status === 'fulfilled' ? organicR.value : undefined;
  const errors: DetectCloakerResult['errors'] = {};
  if (paidR.status === 'rejected') {
    errors.paid = paidR.reason instanceof Error ? paidR.reason.message : String(paidR.reason);
  }
  if (organicR.status === 'rejected') {
    errors.organic =
      organicR.reason instanceof Error ? organicR.reason.message : String(organicR.reason);
  }

  // Both probes failed — bubble up the paid error (most useful one).
  if (!black && !white) {
    throw Object.assign(new Error(errors.paid ?? errors.organic ?? 'Both detections failed.'), {
      code: 'manifest_not_found',
      errors,
    });
  }

  // Only one side resolved → we can't tell if there's a cloaker. Treat as
  // "no cloaker" with the side we got.
  if (!black || !white) {
    const only = black ?? white!;
    log(`cloaker probe: only one side resolved (${black ? 'paid' : 'organic'})`);
    return {
      cloakerDetected: false,
      shared: only,
      ...(black ? { black } : {}),
      ...(white ? { white } : {}),
      errors,
    };
  }

  const sameManifest = manifestKey(black) === manifestKey(white);
  if (sameManifest) {
    log('cloaker probe: same manifest both sides — no cloaker');
    return {
      cloakerDetected: false,
      shared: black,
      black,
      white,
      errors,
    };
  }
  log('cloaker probe: different manifests — CLOAKER DETECTED');
  log(`  black: ${black.manifestUrl}`);
  log(`  white: ${white.manifestUrl}`);
  return {
    cloakerDetected: true,
    black,
    white,
    errors,
  };
}
