import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import { ulid } from 'ulid';
import type { Link } from '../types.js';
import { hostnameOf, resolveUrl, shouldSkipUrl } from '../assets/url-utils.js';
import { generateSelector } from './selectors.js';

export interface ExtractLinksOptions {
  baseUrl?: string;
}

const CTA_CLASS_RE = /(?:^|\s)(btn|button|cta)(?:[-_]\w+)?(?:\s|$)/i;

export function extractLinks(html: string, opts: ExtractLinksOptions = {}): Link[] {
  const $ = cheerio.load(html, { xml: false });
  const links: Link[] = [];
  const baseHost = opts.baseUrl ? hostnameOf(opts.baseUrl) : null;

  $('a[href], button').each((_, el) => {
    const node = $(el as Element);
    const tag = (el as Element).tagName.toLowerCase();
    const rawHref = node.attr('href') ?? '';

    if (tag === 'a' && (!rawHref || shouldSkipUrl(rawHref))) return;

    const absHref = rawHref
      ? opts.baseUrl
        ? resolveUrl(rawHref, opts.baseUrl)
        : rawHref
      : '';

    const text = (node.text() ?? '').trim().slice(0, 256);
    const rel = node.attr('rel') ?? undefined;
    const className = node.attr('class') ?? '';
    const role = node.attr('role') ?? '';

    let isExternal = false;
    if (baseHost && absHref) {
      const linkHost = hostnameOf(absHref);
      if (linkHost && linkHost !== baseHost) isExternal = true;
    }

    const isCta =
      tag === 'button' ||
      role === 'button' ||
      CTA_CLASS_RE.test(className) ||
      node.attr('data-cta') !== undefined;

    const selector = generateSelector($, el as Element);

    links.push({
      id: `lnk_${ulid()}`,
      selector,
      originalHref: absHref,
      currentHref: absHref,
      text,
      rel,
      isExternal,
      isCta,
    });
  });

  return links;
}
