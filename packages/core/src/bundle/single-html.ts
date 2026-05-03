import * as cheerio from 'cheerio';
import { request } from 'undici';
import type { CloneState, Form, Link } from '../types.js';
import { walkCss } from '../assets/css-walker.js';

const MAX_INLINE_BYTES = 5 * 1024 * 1024;

interface AssetData {
  data: Buffer;
  mime: string;
}

export interface SingleHtmlOptions {
  applyEdits: boolean;
  inlineAssets: boolean;
  fetchUrl?: (url: string) => Promise<AssetData | null>;
}

export async function buildSingleHtml(
  state: CloneState,
  opts: SingleHtmlOptions,
): Promise<Buffer> {
  const $ = cheerio.load(state.html, { xml: false });

  if (opts.applyEdits) {
    applyFormEdits($, state.forms);
    applyLinkEdits($, state.links);
  }

  if (!opts.inlineAssets) {
    return Buffer.from($.html(), 'utf8');
  }

  const fetcher = opts.fetchUrl ?? defaultFetch;
  const cache = new Map<string, AssetData | null>();

  await inlineAttrAssets($, fetcher, cache, state.finalUrl);
  await inlineStylesheets($, fetcher, cache, state.finalUrl);
  await inlineStyleBlocks($, fetcher, cache, state.finalUrl);

  return Buffer.from($.html(), 'utf8');
}

function applyFormEdits($: cheerio.CheerioAPI, forms: Form[]): void {
  for (const form of forms) {
    const target = $(form.selector).first();
    if (target.length === 0) continue;
    if (form.mode === 'disable') {
      target.attr('action', '');
      target.attr('onsubmit', 'return false;');
      target.find('button[type="submit"], input[type="submit"]').attr('disabled', 'disabled');
      continue;
    }
    if (form.mode === 'replace' || form.mode === 'capture_redirect') {
      target.attr('action', form.currentAction);
      if (form.mode === 'capture_redirect' && form.redirectTo) {
        target.attr('data-redirect-to', form.redirectTo);
      }
    } else if (form.mode === 'keep' && form.currentAction !== form.originalAction) {
      target.attr('action', form.currentAction);
    }
  }
}

function applyLinkEdits($: cheerio.CheerioAPI, links: Link[]): void {
  for (const link of links) {
    if (link.currentHref === link.originalHref) continue;
    const target = $(link.selector).first();
    if (target.length === 0) continue;
    if (target.is('a')) {
      target.attr('href', link.currentHref);
    } else {
      target.attr('data-href', link.currentHref);
    }
  }
}

async function inlineAttrAssets(
  $: cheerio.CheerioAPI,
  fetcher: (u: string) => Promise<AssetData | null>,
  cache: Map<string, AssetData | null>,
  baseUrl: string,
): Promise<void> {
  const targets: Array<{ selector: string; attr: string }> = [
    { selector: 'img[src]', attr: 'src' },
    { selector: 'source[src]', attr: 'src' },
    { selector: 'video[poster]', attr: 'poster' },
    { selector: 'audio[src]', attr: 'src' },
    { selector: 'video[src]', attr: 'src' },
    { selector: 'link[rel~="icon"][href]', attr: 'href' },
    { selector: 'link[rel="apple-touch-icon"][href]', attr: 'href' },
  ];

  const tasks: Array<Promise<void>> = [];
  for (const t of targets) {
    $(t.selector).each((_, el) => {
      const node = $(el);
      const url = node.attr(t.attr);
      if (!url || isInlineable(url) === false) return;
      tasks.push(
        toDataUri(url, fetcher, cache, baseUrl).then((dataUri) => {
          if (dataUri) node.attr(t.attr, dataUri);
        }),
      );
    });
  }
  await Promise.all(tasks);
}

async function inlineStylesheets(
  $: cheerio.CheerioAPI,
  fetcher: (u: string) => Promise<AssetData | null>,
  cache: Map<string, AssetData | null>,
  baseUrl: string,
): Promise<void> {
  const links = $('link[rel~="stylesheet"][href]').toArray();
  for (const el of links) {
    const node = $(el);
    const href = node.attr('href');
    if (!href) continue;
    const fetched = await getOrFetch(href, fetcher, cache);
    if (!fetched) continue;
    const cssText = fetched.data.toString('utf8');
    const inlined = await inlineCssReferences(cssText, href, fetcher, cache);
    const styleTag = `<style>${inlined}</style>`;
    node.replaceWith(styleTag);
  }
}

async function inlineStyleBlocks(
  $: cheerio.CheerioAPI,
  fetcher: (u: string) => Promise<AssetData | null>,
  cache: Map<string, AssetData | null>,
  baseUrl: string,
): Promise<void> {
  const blocks = $('style').toArray();
  for (const el of blocks) {
    const node = $(el);
    const css = node.text();
    if (!css || !css.includes('url(')) continue;
    const inlined = await inlineCssReferences(css, baseUrl, fetcher, cache);
    node.text(inlined);
  }
}

async function inlineCssReferences(
  css: string,
  cssBaseUrl: string,
  fetcher: (u: string) => Promise<AssetData | null>,
  cache: Map<string, AssetData | null>,
): Promise<string> {
  const collected = new Map<string, string>();
  const firstPass = walkCss(css, {
    cssBaseUrl,
    visit: (_raw, abs) => abs,
  });
  await Promise.all(
    firstPass.collectedUrls.map(async (u) => {
      if (!isInlineable(u)) return;
      const dataUri = await toDataUri(u, fetcher, cache, cssBaseUrl);
      if (dataUri) collected.set(u, dataUri);
    }),
  );
  const replaced = walkCss(css, {
    cssBaseUrl,
    visit: (_raw, abs) => collected.get(abs) ?? abs,
  });
  return replaced.css;
}

async function toDataUri(
  url: string,
  fetcher: (u: string) => Promise<AssetData | null>,
  cache: Map<string, AssetData | null>,
  baseUrl: string,
): Promise<string | null> {
  const abs = absolutize(url, baseUrl);
  if (!abs) return null;
  const fetched = await getOrFetch(abs, fetcher, cache);
  if (!fetched) return null;
  if (fetched.data.length > MAX_INLINE_BYTES) return null;
  return `data:${fetched.mime};base64,${fetched.data.toString('base64')}`;
}

async function getOrFetch(
  url: string,
  fetcher: (u: string) => Promise<AssetData | null>,
  cache: Map<string, AssetData | null>,
): Promise<AssetData | null> {
  if (cache.has(url)) return cache.get(url) ?? null;
  const v = await fetcher(url);
  cache.set(url, v);
  return v;
}

function isInlineable(url: string): boolean {
  if (!url) return false;
  const v = url.trim();
  if (v.startsWith('data:')) return false;
  if (v.startsWith('blob:')) return false;
  if (v.startsWith('#')) return false;
  if (v.startsWith('javascript:')) return false;
  return true;
}

function absolutize(url: string, base: string): string | null {
  if (url.startsWith('//')) {
    let scheme = 'https:';
    try {
      scheme = new URL(base).protocol;
    } catch {
      // ignore
    }
    return `${scheme}${url}`;
  }
  try {
    return new URL(url, base).toString();
  } catch {
    return null;
  }
}

async function defaultFetch(url: string): Promise<AssetData | null> {
  try {
    const res = await request(url, { method: 'GET' });
    if (res.statusCode < 200 || res.statusCode >= 400) {
      res.body.destroy?.();
      return null;
    }
    const chunks: Buffer[] = [];
    for await (const c of res.body) {
      chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
    }
    const ct = res.headers['content-type'];
    const mime =
      typeof ct === 'string'
        ? ct
        : Array.isArray(ct)
          ? (ct[0] ?? 'application/octet-stream')
          : 'application/octet-stream';
    return { data: Buffer.concat(chunks), mime };
  } catch {
    return null;
  }
}
