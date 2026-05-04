import * as cheerio from 'cheerio';
import type { InspectResult } from '@page-cloner/shared';
import { resolveUrl } from '../assets/url-utils.js';

// Path-level patterns: things like /checkout, /cart, /buy, etc.
const CHECKOUT_PATH_RE =
  /\/(checkout|cart|carrinho|buy|comprar|order|pedido|payment|pagamento|purchase|compra)(\/|$|\?|#)/i;
const CHECKOUT_QUERY_RE = /[?&](add-to-cart|action=add|add_to_cart)=/i;

// Known checkout/payment platforms. Any link to these hosts is a checkout link
// regardless of path, because their entire domain exists for taking money.
// Brazilian and global mix — the audience is mostly PT-BR digital products.
const CHECKOUT_HOSTS = [
  // Digistore24 (DE/global)
  'checkout-ds24.com',
  'digistore24.com',
  // Hotmart (BR/global)
  'hotmart.com',
  'pay.hotmart.com',
  'pay.hotmart.app',
  'hotmart.app',
  // Kiwify (BR)
  'kiwify.com.br',
  'kiwify.com',
  'kiwify.app',
  'pay.kiwify.com.br',
  'pay.kiwify.com',
  // Monetizze (BR)
  'monetizze.com.br',
  'app.monetizze.com.br',
  // Eduzz (BR)
  'eduzz.com',
  'sun.eduzz.com',
  'chk.eduzz.com',
  // Braip (BR)
  'braip.com',
  'braip.com.br',
  'ev.braip.com',
  // Ticto (BR)
  'ticto.com.br',
  'app.ticto.app',
  'ticto.app',
  // Yampi (BR)
  'yampi.com.br',
  'pay.yampi.com.br',
  // Nuvemshop / Tiendanube (BR/AR)
  'nuvemshop.com.br',
  'tiendanube.com',
  // Loja Integrada (BR)
  'lojaintegrada.com.br',
  // Pagar.me (BR)
  'pagar.me',
  'api.pagar.me',
  // PagSeguro (BR)
  'pagseguro.uol.com.br',
  'sandbox.pagseguro.uol.com.br',
  'pagbank.com.br',
  // Mercado Pago (BR/LatAm)
  'mercadopago.com.br',
  'mercadopago.com',
  'mpago.la',
  // Stripe
  'stripe.com',
  'checkout.stripe.com',
  'buy.stripe.com',
  // Paddle
  'paddle.com',
  'pay.paddle.com',
  'checkout.paddle.com',
  // PayPal
  'paypal.com',
  'paypal.com.br',
  // Gumroad
  'gumroad.com',
  // Shopify
  'shopify.com',
  'checkout.shopify.com',
  'shop.app',
  // ClickBank
  'clickbank.net',
  'clkbank.com',
  // SamCart
  'samcart.com',
  // ThriveCart
  'thrivecart.com',
];

// Hostname patterns — catches subdomains like "checkout.foo.com",
// "pay.foo.com", "payments.foo.com", "buy.foo.com" etc.
const CHECKOUT_HOST_RE = /(^|\.)(checkout|pay|payments|buy|carrinho|order|pagamento)(\.|$|-)/i;

function hostMatches(host: string): boolean {
  const h = host.toLowerCase();
  if (CHECKOUT_HOSTS.includes(h)) return true;
  // Allow www.checkout-ds24.com etc.
  if (CHECKOUT_HOSTS.some((known) => h === `www.${known}` || h.endsWith(`.${known}`))) return true;
  return CHECKOUT_HOST_RE.test(h);
}

function isCheckoutHref(href: string): boolean {
  if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:'))
    return false;
  try {
    const u = new URL(href, 'https://example.com');
    if (u.hostname && u.hostname !== 'example.com' && hostMatches(u.hostname)) return true;
    return CHECKOUT_PATH_RE.test(u.pathname) || CHECKOUT_QUERY_RE.test(u.search);
  } catch {
    return CHECKOUT_PATH_RE.test(href);
  }
}

export function inspectHtml(html: string, baseUrl: string): InspectResult {
  const $ = cheerio.load(html, { xml: false });

  // Checkout links — also pull from <button onclick>, <form action> and
  // common checkout-button attributes so we catch JS-driven flows.
  const checkoutMap = new Map<string, { text: string; occurrences: number }>();

  const recordCandidate = (rawHref: string, text: string) => {
    const absHref = resolveUrl(rawHref, baseUrl);
    if (!absHref || !isCheckoutHref(absHref)) return;
    const existing = checkoutMap.get(absHref);
    const trimmed = text.trim().slice(0, 120);
    if (existing) {
      existing.occurrences += 1;
      if (!existing.text && trimmed) existing.text = trimmed;
    } else {
      checkoutMap.set(absHref, { text: trimmed, occurrences: 1 });
    }
  };

  $('a[href]').each((_, el) => {
    recordCandidate($(el).attr('href') ?? '', $(el).text() ?? '');
  });
  $('form[action]').each((_, el) => {
    recordCandidate($(el).attr('action') ?? '', $(el).find('button, [type=submit]').first().text() ?? 'form');
  });
  $('[data-checkout-url], [data-href], [data-url]').each((_, el) => {
    const $el = $(el);
    const url =
      $el.attr('data-checkout-url') ?? $el.attr('data-href') ?? $el.attr('data-url') ?? '';
    if (url) recordCandidate(url, $el.text() ?? '');
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
