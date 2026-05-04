import * as cheerio from 'cheerio';
import { resolveUrl } from '../assets/url-utils.js';

export interface DiscoveredStep {
  url: string;
  /** Visible text of the link/button — used to label the step in the UI. */
  label: string;
  /** Where the candidate came from. */
  source: 'a' | 'form' | 'data-attr' | 'js-redirect';
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
  'iniciar',
  'começar',
  'comecar',
  'finalizar',
  'fechar',
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
];

const SKIP_TLDS = [
  'facebook.com',
  'twitter.com',
  'x.com',
  'instagram.com',
  'youtube.com',
  'youtu.be',
  'tiktok.com',
  'wa.me',
  'whatsapp.com',
  'mailto:',
  'tel:',
];

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
  return SKIP_TLDS.some((s) => low.includes(s));
}

function scoreCandidate(label: string, url: string): number {
  let score = 0.3; // base
  const lblLow = label.toLowerCase().trim();
  const urlLow = url.toLowerCase();
  if (CTA_TEXT_HINTS.some((h) => lblLow.includes(h))) score += 0.4;
  if (CTA_PATH_HINTS.some((h) => urlLow.includes(`/${h}`) || urlLow.includes(`/${h}/`))) {
    score += 0.3;
  }
  if (lblLow.length === 0) score -= 0.1; // empty-text links are often nav, less interesting
  if (lblLow.length > 80) score -= 0.1; // long copy = probably article link
  return Math.max(0, Math.min(1, score));
}

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
    // Strip fragments — they don't change the page.
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
      score: scoreCandidate(trimmed, cleanUrl),
    });
  };

  $('a[href]').each((_, el) => {
    push($(el).attr('href') ?? '', $(el).text() ?? '', 'a');
  });
  $('form[action]').each((_, el) => {
    push($(el).attr('action') ?? '', $(el).find('button, [type=submit]').first().text() ?? 'form', 'form');
  });
  $('[data-href], [data-url], [data-checkout-url]').each((_, el) => {
    const $el = $(el);
    const url = $el.attr('data-href') ?? $el.attr('data-url') ?? $el.attr('data-checkout-url') ?? '';
    if (url) push(url, $el.text() ?? '', 'data-attr');
  });
  // JS-driven window.location = '...' inside inline scripts.
  $('script').each((_, el) => {
    const code = $(el).html() ?? '';
    const matches = code.matchAll(
      /(?:window\.)?location(?:\.href)?\s*=\s*['"]([^'"]+)['"]/g,
    );
    for (const m of matches) {
      push(m[1] ?? '', '(redirect JS)', 'js-redirect');
    }
  });

  // Sort by score desc so callers see the most promising candidates first.
  out.sort((a, b) => b.score - a.score);
  return out;
}
