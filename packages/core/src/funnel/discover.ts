import * as cheerio from 'cheerio';
import { resolveUrl } from '../assets/url-utils.js';

export interface DiscoveredStep {
  url: string;
  /** Visible text of the link/button — used to label the step in the UI. */
  label: string;
  /** Where the candidate came from. */
  source:
    | 'a'
    | 'form'
    | 'data-attr'
    | 'js-redirect'
    | 'meta-refresh'
    | 'onclick'
    | 'back-redirect';
  /** Heuristic confidence (0..1) — higher = more likely a funnel-step CTA. */
  score: number;
}

const CTA_TEXT_HINTS = [
  // PT
  'comprar',
  'continuar',
  'avançar',
  'avancar',
  'próximo',
  'proximo',
  'garantir',
  'quero',
  'sim',
  'aceitar',
  'pegar',
  'entrar',
  'acessar',
  'iniciar',
  'começar',
  'comecar',
  'finalizar',
  'fechar',
  'liberar',
  'reservar',
  // EN
  'buy',
  'continue',
  'next',
  'get',
  'yes',
  'add to cart',
  'checkout',
  'order',
  'claim',
  'go',
  'start',
  'finish',
  'unlock',
  'access',
  'enter',
];

const CTA_PATH_HINTS = [
  'checkout',
  'cart',
  'carrinho',
  'buy',
  'comprar',
  'order',
  'pedido',
  'upsell',
  'down',
  'thanks',
  'obrigado',
  'success',
  'paid',
  'thank-you',
  'thankyou',
  'next',
  'continue',
  'back',
  'leave',
  'exit',
  'second',
  'third',
  'oferta',
  'offer',
];

const SKIP_HOSTS = [
  'facebook.com',
  'twitter.com',
  'x.com',
  'instagram.com',
  'youtube.com',
  'youtu.be',
  'tiktok.com',
  'wa.me',
  'whatsapp.com',
  'linkedin.com',
  'pinterest.com',
];

const SKIP_SCHEMES = ['mailto:', 'tel:', 'sms:', 'whatsapp:'];

function sameHost(a: string, b: string): boolean {
  try {
    return new URL(a).hostname === new URL(b).hostname;
  } catch {
    return false;
  }
}

function pathEquals(a: string, b: string): boolean {
  try {
    return new URL(a).pathname === new URL(b).pathname;
  } catch {
    return false;
  }
}

function isSkipped(url: string): boolean {
  const low = url.toLowerCase();
  if (SKIP_SCHEMES.some((s) => low.startsWith(s))) return true;
  // Common analytics / asset paths we don't want as funnel steps.
  if (/\.(js|css|png|jpg|jpeg|webp|gif|svg|ico|woff2?|ttf|eot)(\?|$)/i.test(low)) return true;
  try {
    const host = new URL(low).hostname;
    return SKIP_HOSTS.some((s) => host === s || host.endsWith(`.${s}`));
  } catch {
    return false;
  }
}

function scoreCandidate(label: string, url: string, source: DiscoveredStep['source']): number {
  // Strong sources start higher because they're explicit funnel transitions.
  let score = source === 'meta-refresh' || source === 'back-redirect' || source === 'js-redirect'
    ? 0.7
    : source === 'onclick'
      ? 0.55
      : 0.35;

  const lblLow = label.toLowerCase().trim();
  const urlLow = url.toLowerCase();
  if (CTA_TEXT_HINTS.some((h) => lblLow.includes(h))) score += 0.25;
  if (CTA_PATH_HINTS.some((h) => urlLow.includes(`/${h}`) || urlLow.includes(`/${h}/`))) {
    score += 0.2;
  }
  // Penalize obvious nav links.
  if (/(home|sobre|about|contact|privac|terms|politica|política)/i.test(urlLow)) score -= 0.15;
  if (lblLow.length > 80) score -= 0.1;
  return Math.max(0, Math.min(1, score));
}

/**
 * Match every literal URL referenced inside an inline script, regardless of
 * how it's used (assignment, replace(), assign(), pushState, fetch, etc.).
 * We only care about same-host candidates so the over-collection is bounded.
 */
const URL_LITERAL_RE = /['"`](https?:\/\/[^\s'"`<>]+|\/[^\s'"`<>]+)['"`]/g;

function looksLikeRedirectScript(code: string): boolean {
  return (
    /\blocation\s*(?:\.\s*(?:href|replace|assign))?\s*=/i.test(code) ||
    /\blocation\.replace\s*\(/i.test(code) ||
    /\blocation\.assign\s*\(/i.test(code) ||
    /\bhistory\.(push|replace)State\s*\(/i.test(code) ||
    /\bpopstate\b/i.test(code) ||
    /\bwindow\.open\s*\(/i.test(code)
  );
}

/**
 * Detect redirect URLs inside inline scripts (incl. back-redirects via
 * popstate). Returns each URL with the kind of redirect heuristically
 * classified.
 */
function extractScriptRedirects(
  code: string,
): Array<{ url: string; kind: 'js-redirect' | 'back-redirect' }> {
  if (!looksLikeRedirectScript(code)) return [];
  const out: Array<{ url: string; kind: 'js-redirect' | 'back-redirect' }> = [];
  const isBack = /\bpopstate\b/i.test(code) || /history\.(push|replace)State/i.test(code);

  for (const m of code.matchAll(URL_LITERAL_RE)) {
    const url = m[1];
    if (!url) continue;
    // Drop obviously-non-page strings (asset extensions, query keys).
    if (/\.(js|css|png|jpg|jpeg|webp|gif|svg|ico|woff2?|ttf|eot|json|xml)(\?|$)/i.test(url)) {
      continue;
    }
    out.push({ url, kind: isBack ? 'back-redirect' : 'js-redirect' });
  }
  return out;
}

const ONCLICK_URL_RE = /(?:location(?:\.href)?|window\.location(?:\.href)?)\s*=\s*['"`]([^'"`]+)['"`]/i;
const ONCLICK_OPEN_RE = /window\.open\s*\(\s*['"`]([^'"`]+)['"`]/i;

function extractFromOnclick(attr: string | undefined): string | null {
  if (!attr) return null;
  const m = ONCLICK_URL_RE.exec(attr) ?? ONCLICK_OPEN_RE.exec(attr);
  return m?.[1] ?? null;
}

const META_REFRESH_RE = /\d+\s*;\s*url\s*=\s*([^\s'"]+)/i;

/**
 * Find candidate "next-step" URLs in the page. Returns same-host URLs that
 * look like they could be the next page of the funnel.
 */
export function discoverNextSteps(html: string, baseUrl: string): DiscoveredStep[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const out: DiscoveredStep[] = [];

  const push = (raw: string, label: string, source: DiscoveredStep['source']) => {
    if (!raw) return;
    if (raw.startsWith('#') || raw.startsWith('javascript:')) return;
    if (isSkipped(raw)) return;
    const abs = resolveUrl(raw, baseUrl);
    if (!abs) return;
    if (!sameHost(abs, baseUrl)) return;
    if (pathEquals(abs, baseUrl)) return; // self-link
    let cleanUrl = abs;
    try {
      const u = new URL(abs);
      u.hash = '';
      cleanUrl = u.toString();
    } catch {
      // ignore
    }
    if (seen.has(cleanUrl)) return;
    seen.add(cleanUrl);
    const trimmed = (label ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
    out.push({
      url: cleanUrl,
      label: trimmed,
      source,
      score: scoreCandidate(trimmed, cleanUrl, source),
    });
  };

  // 1) Anchor links + buttons that link.
  $('a[href]').each((_, el) => {
    push($(el).attr('href') ?? '', $(el).text() ?? '', 'a');
  });

  // 2) Form actions (e.g. lead-capture forms posting to next step).
  $('form[action]').each((_, el) => {
    push(
      $(el).attr('action') ?? '',
      $(el).find('button, [type=submit]').first().text() ?? 'form',
      'form',
    );
  });

  // 3) Data attributes commonly used by JS-driven CTAs.
  $('[data-href], [data-url], [data-checkout-url], [data-target-url], [data-link]').each(
    (_, el) => {
      const $el = $(el);
      const url =
        $el.attr('data-href') ??
        $el.attr('data-url') ??
        $el.attr('data-checkout-url') ??
        $el.attr('data-target-url') ??
        $el.attr('data-link') ??
        '';
      if (url) push(url, $el.text() ?? '', 'data-attr');
    },
  );

  // 4) onclick handlers with literal URLs.
  $('[onclick]').each((_, el) => {
    const $el = $(el);
    const url = extractFromOnclick($el.attr('onclick'));
    if (url) push(url, $el.text() ?? '', 'onclick');
  });

  // 5) <meta http-equiv="refresh" content="0; url=/next">
  $('meta[http-equiv="refresh" i]').each((_, el) => {
    const m = META_REFRESH_RE.exec($(el).attr('content') ?? '');
    if (m && m[1]) push(m[1], '(meta refresh)', 'meta-refresh');
  });

  // 6) Inline scripts: redirect-like statements (incl. popstate back-redirects).
  $('script:not([src])').each((_, el) => {
    const code = $(el).html() ?? '';
    if (code.length === 0) return;
    for (const r of extractScriptRedirects(code)) {
      push(r.url, r.kind === 'back-redirect' ? '(back redirect)' : '(redirect JS)', r.kind);
    }
  });

  // Sort by score desc so callers see the most promising candidates first.
  out.sort((a, b) => b.score - a.score);
  return out;
}
