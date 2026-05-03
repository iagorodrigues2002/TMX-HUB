import * as cheerio from 'cheerio';
import type { InspectResult } from '@page-cloner/shared';
import { resolveUrl } from '../assets/url-utils.js';

const CHECKOUT_PATH_RE =
  /\/(checkout|cart|carrinho|buy|comprar|order|pedido|payment|pagamento|purchase|compra)(\/|$|\?|#)/i;
const CHECKOUT_QUERY_RE = /[?&](add-to-cart|action=add|add_to_cart)=/i;

function isCheckoutHref(href: string): boolean {
  if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:'))
    return false;
  try {
    const u = new URL(href, 'https://example.com');
    return CHECKOUT_PATH_RE.test(u.pathname) || CHECKOUT_QUERY_RE.test(u.search);
  } catch {
    return CHECKOUT_PATH_RE.test(href);
  }
}

export function inspectHtml(html: string, baseUrl: string): InspectResult {
  const $ = cheerio.load(html, { xml: false });

  // Checkout links
  const checkoutMap = new Map<string, { text: string; occurrences: number }>();
  $('a[href]').each((_, el) => {
    const rawHref = $(el).attr('href') ?? '';
    const absHref = resolveUrl(rawHref, baseUrl);
    if (!absHref || !isCheckoutHref(absHref)) return;
    const existing = checkoutMap.get(absHref);
    const text = ($(el).text() ?? '').trim().slice(0, 120);
    if (existing) {
      existing.occurrences += 1;
    } else {
      checkoutMap.set(absHref, { text, occurrences: 1 });
    }
  });

  const checkoutLinks = Array.from(checkoutMap.entries()).map(([href, v]) => ({
    href,
    text: v.text,
    occurrences: v.occurrences,
  }));

  // HEAD scripts
  const headScripts: InspectResult['headScripts'] = [];
  let inlineScriptCount = 0;
  $('head script').each((_, el) => {
    const src = $(el).attr('src');
    const type = $(el).attr('type') ?? null;
    if (src) {
      const absSrc = resolveUrl(src, baseUrl) ?? src;
      headScripts.push({ src: absSrc, type });
    } else {
      inlineScriptCount += 1;
    }
  });

  return {
    url: baseUrl,
    finalUrl: baseUrl,
    checkoutLinks,
    headScripts,
    inlineScriptCount,
  };
}
