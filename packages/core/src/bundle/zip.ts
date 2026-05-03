import archiver from 'archiver';
import * as cheerio from 'cheerio';
import { request } from 'undici';
import type { CloneState, Form, Link } from '../types.js';
import { walkCss } from '../assets/css-walker.js';
import { storageKeyFor } from '../assets/manifest.js';

interface AssetData {
  data: Buffer;
  mime: string;
}

export interface ZipBundleOptions {
  applyEdits: boolean;
  fetchUrl?: (url: string) => Promise<AssetData | null>;
}

export async function buildZip(state: CloneState, opts: ZipBundleOptions): Promise<Buffer> {
  const $ = cheerio.load(state.html, { xml: false });

  if (opts.applyEdits) {
    applyFormEdits($, state.forms);
    applyLinkEdits($, state.links);
  }

  const fetcher = opts.fetchUrl ?? defaultFetch;
  const urlToKey = new Map<string, string>();
  const fetched = new Map<string, AssetData>();

  for (const entry of state.assets.entries) {
    if (!entry.url) continue;
    if (urlToKey.has(entry.url)) continue;
    const data = await fetcher(entry.url);
    if (!data) continue;
    const key = entry.storageKey ?? storageKeyFor(entry.hash || hashish(entry.url), data.mime, entry.url);
    urlToKey.set(entry.url, `assets/${key}`);
    fetched.set(entry.url, data);
  }

  rewriteAttrs($, urlToKey, state.finalUrl);
  rewriteStyleBlocks($, urlToKey, state.finalUrl);

  const zip = archiver('zip', { zlib: { level: 9 } });
  const chunks: Buffer[] = [];
  zip.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
  const done = new Promise<void>((resolve, reject) => {
    zip.on('end', resolve);
    zip.on('close', resolve);
    zip.on('error', reject);
  });

  zip.append($.html(), { name: 'index.html' });
  for (const [url, key] of urlToKey) {
    const asset = fetched.get(url);
    if (!asset) continue;
    zip.append(asset.data, { name: key });
  }
  await zip.finalize();
  await done;

  return Buffer.concat(chunks);
}

function applyFormEdits($: cheerio.CheerioAPI, forms: Form[]): void {
  for (const form of forms) {
    const target = $(form.selector).first();
    if (target.length === 0) continue;
    if (form.mode === 'disable') {
      target.attr('action', '');
      target.attr('onsubmit', 'return false;');
      continue;
    }
    if (form.mode === 'replace' || form.mode === 'capture_redirect') {
      target.attr('action', form.currentAction);
      if (form.mode === 'capture_redirect' && form.redirectTo) {
        target.attr('data-redirect-to', form.redirectTo);
      }
    } else if (form.currentAction !== form.originalAction) {
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

function rewriteAttrs(
  $: cheerio.CheerioAPI,
  urlToKey: Map<string, string>,
  baseUrl: string,
): void {
  const attrTargets: Array<[string, string]> = [
    ['img', 'src'],
    ['source', 'src'],
    ['video', 'poster'],
    ['video', 'src'],
    ['audio', 'src'],
    ['link', 'href'],
    ['script', 'src'],
  ];
  for (const [tag, attr] of attrTargets) {
    $(tag).each((_, el) => {
      const node = $(el);
      const v = node.attr(attr);
      if (!v) return;
      const abs = absolutize(v, baseUrl);
      if (abs && urlToKey.has(abs)) {
        node.attr(attr, urlToKey.get(abs) ?? v);
      }
    });
  }
}

function rewriteStyleBlocks(
  $: cheerio.CheerioAPI,
  urlToKey: Map<string, string>,
  baseUrl: string,
): void {
  $('style').each((_, el) => {
    const node = $(el);
    const css = node.text();
    if (!css || !css.includes('url(')) return;
    const result = walkCss(css, {
      cssBaseUrl: baseUrl,
      visit: (_raw, abs) => urlToKey.get(abs),
    });
    node.text(result.css);
  });
  $('[style]').each((_, el) => {
    const node = $(el);
    const v = node.attr('style');
    if (!v || !v.includes('url(')) return;
    const wrapped = `__pc_inline__{${v}}`;
    const result = walkCss(wrapped, {
      cssBaseUrl: baseUrl,
      visit: (_raw, abs) => urlToKey.get(abs),
    });
    const unwrapped = result.css
      .replace(/^\s*__pc_inline__\s*\{\s*/, '')
      .replace(/\s*\}\s*$/, '');
    node.attr('style', unwrapped);
  });
}

function absolutize(url: string, base: string): string | null {
  if (!url) return null;
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

function hashish(url: string): string {
  let h = 0;
  for (let i = 0; i < url.length; i += 1) {
    h = ((h << 5) - h + url.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(16).padStart(8, '0');
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
