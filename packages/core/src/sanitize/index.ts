import * as cheerio from 'cheerio';
import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import type { SanitizeOptions, SanitizeRemovalCounts, SanitizeResult } from '../types.js';
import { isCspMeta, isJavaScriptUrl, isOnEventAttr, URL_ATTRS } from './attr-rules.js';
import { isTrackingUrl } from './tracking-hosts.js';

export function sanitize(html: string, opts: SanitizeOptions = {}): SanitizeResult {
  const counts: SanitizeRemovalCounts = {
    scripts: 0,
    noscripts: 0,
    templates: 0,
    inlineHandlers: 0,
    javascriptUrls: 0,
    trackingPixels: 0,
    iframeSrcdoc: 0,
    cspMeta: 0,
  };

  const $ = cheerio.load(html, { xml: false });

  $('script').each(() => {
    counts.scripts += 1;
  });
  $('script').remove();

  $('noscript').each(() => {
    counts.noscripts += 1;
  });
  $('noscript').remove();

  if (opts.stripTemplates) {
    $('template').each(() => {
      counts.templates += 1;
    });
    $('template').remove();
  }

  $('meta').each((_, el) => {
    const httpEquiv = $(el).attr('http-equiv');
    if (isCspMeta(httpEquiv)) {
      counts.cspMeta += 1;
      $(el).remove();
    }
  });

  $('iframe[srcdoc]').each((_, el) => {
    counts.iframeSrcdoc += 1;
    $(el).removeAttr('srcdoc');
  });

  $('*').each((_, el) => {
    if (el.type !== 'tag') return;
    const node = el;
    const attribs = node.attribs ?? {};
    for (const attrName of Object.keys(attribs)) {
      if (isOnEventAttr(attrName)) {
        counts.inlineHandlers += 1;
        delete node.attribs[attrName];
      }
    }
    for (const urlAttr of URL_ATTRS) {
      const v = node.attribs[urlAttr];
      if (v && isJavaScriptUrl(v)) {
        counts.javascriptUrls += 1;
        delete node.attribs[urlAttr];
      }
    }
  });

  if (opts.removeTracking !== false) {
    const extra = opts.extraTrackingHosts ?? [];
    $('img').each((_, el) => {
      const src = $(el).attr('src');
      if (src && isTrackingUrl(src, extra)) {
        counts.trackingPixels += 1;
        $(el).remove();
      }
    });
    $('link[rel="preconnect"], link[rel="dns-prefetch"], link[rel="preload"]').each((_, el) => {
      const href = $(el).attr('href');
      if (href && isTrackingUrl(href, extra)) {
        $(el).remove();
      }
    });
  }

  const intermediate = $.html();

  // Defense in depth via DOMPurify. We allow style/link/meta tags through and
  // keep the style attribute because resolveAssets relies on url() values
  // surviving sanitization.
  const dom = new JSDOM('');
  const purify = createDOMPurify(dom.window as unknown as Window & typeof globalThis);
  const cleaned = purify.sanitize(intermediate, {
    WHOLE_DOCUMENT: true,
    RETURN_TRUSTED_TYPE: false,
    ADD_TAGS: ['link', 'meta', 'style', 'iframe'],
    ADD_ATTR: opts.allowDataAttributes
      ? ['target', 'rel', 'crossorigin', 'integrity', 'as', 'style', 'http-equiv', 'content']
      : ['target', 'rel', 'style', 'http-equiv', 'content'],
    FORBID_TAGS: ['script', 'noscript'],
    FORBID_ATTR: ['srcdoc'],
    ALLOW_DATA_ATTR: true,
    ALLOW_UNKNOWN_PROTOCOLS: false,
  });

  return {
    html: typeof cleaned === 'string' ? cleaned : String(cleaned),
    removed: counts,
  };
}
