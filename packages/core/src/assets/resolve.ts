import * as cheerio from 'cheerio';
import type {
  AssetEntry,
  AssetManifest,
  DownloadedAsset,
  ResolveAssetsOptions,
  ResolveAssetsResult,
} from '../types.js';
import { walkCss } from './css-walker.js';
import { downloadMany, type DownloadOptions } from './downloader.js';
import { emptyManifest, makeEntryFromDownloaded, makeEntryFromUrl } from './manifest.js';
import { parseSrcset, serializeSrcset } from './srcset.js';
import { resolveUrl, shouldSkipUrl } from './url-utils.js';

const HTML_URL_ATTRS: Record<string, ReadonlyArray<string>> = {
  img: ['src', 'data-src'],
  source: ['src', 'data-src'],
  audio: ['src'],
  video: ['src', 'poster'],
  iframe: ['src'],
  embed: ['src'],
  object: ['data'],
  link: ['href'],
  script: ['src'],
  use: ['href', 'xlink:href'],
};

const SRCSET_TAGS = new Set(['img', 'source']);

const DEFAULT_DOWNLOAD: DownloadOptions = {
  maxBytes: 25 * 1024 * 1024,
  maxConcurrency: 8,
  timeoutMs: 15_000,
};

export async function resolveAssets(
  html: string,
  baseUrl: string,
  opts: ResolveAssetsOptions = {},
): Promise<ResolveAssetsResult> {
  const $ = cheerio.load(html, { xml: false });
  const collected = new Set<string>();
  const inlineStyleEdits: Array<() => void> = [];

  for (const [tag, attrs] of Object.entries(HTML_URL_ATTRS)) {
    $(tag).each((_, el) => {
      const node = $(el);
      for (const attr of attrs) {
        const v = node.attr(attr);
        if (!v || shouldSkipUrl(v)) continue;
        const abs = resolveUrl(v, baseUrl);
        collected.add(abs);
        node.attr(attr, abs);
      }
    });
  }

  $('img, source').each((_, el) => {
    if (!SRCSET_TAGS.has(el.tagName.toLowerCase())) return;
    const node = $(el);
    const srcset = node.attr('srcset');
    if (!srcset) return;
    const candidates = parseSrcset(srcset);
    const rewritten = candidates.map((c) => {
      if (shouldSkipUrl(c.url)) return c;
      const abs = resolveUrl(c.url, baseUrl);
      collected.add(abs);
      return { url: abs, descriptor: c.descriptor };
    });
    node.attr('srcset', serializeSrcset(rewritten));
  });

  $('style').each((_, el) => {
    const node = $(el);
    const css = node.text();
    if (!css || !css.includes('url(')) return;
    const result = walkCss(css, {
      cssBaseUrl: baseUrl,
      visit: (_raw, abs) => {
        collected.add(abs);
        return abs;
      },
    });
    inlineStyleEdits.push(() => node.text(result.css));
  });

  $('[style]').each((_, el) => {
    const node = $(el);
    const styleVal = node.attr('style');
    if (!styleVal || !styleVal.includes('url(')) return;
    const wrapped = `__pc_inline__{${styleVal}}`;
    const result = walkCss(wrapped, {
      cssBaseUrl: baseUrl,
      visit: (_raw, abs) => {
        collected.add(abs);
        return abs;
      },
    });
    const unwrapped = result.css.replace(/^\s*__pc_inline__\s*\{\s*/, '').replace(/\s*\}\s*$/, '');
    node.attr('style', unwrapped);
  });

  for (const apply of inlineStyleEdits) apply();

  if (!opts.download) {
    const manifest = emptyManifest();
    for (const url of collected) {
      const entry = makeEntryFromUrl(url);
      manifest.entries.push(entry);
      manifest.byUrl[url] = entry.id;
    }
    return {
      html: opts.rewriteHtml === false ? html : $.html(),
      assets: manifest,
      bytesTotal: 0,
    };
  }

  const downloadOpts: DownloadOptions = {
    maxBytes: opts.maxBytes ?? DEFAULT_DOWNLOAD.maxBytes,
    maxConcurrency: opts.maxConcurrency ?? DEFAULT_DOWNLOAD.maxConcurrency,
    timeoutMs: opts.timeoutMs ?? DEFAULT_DOWNLOAD.timeoutMs,
  };

  const allDownloaded = new Map<string, DownloadedAsset>();
  let cssQueue = Array.from(
    new Set(
      Array.from(collected).filter((u) => {
        const lower = u.toLowerCase();
        return lower.includes('.css') || lower.endsWith('/');
      }),
    ),
  );

  // Initial pass: download EVERYTHING collected from HTML.
  const firstPass = await downloadMany(Array.from(collected), downloadOpts);
  for (const [k, v] of firstPass) allDownloaded.set(k, v);

  // CSS recursion: each downloaded stylesheet may import or reference more.
  const seenCss = new Set<string>(cssQueue);
  while (true) {
    const nextUrls: string[] = [];
    for (const cssUrl of cssQueue) {
      const dl = allDownloaded.get(cssUrl);
      if (!dl) continue;
      if (!isCssMime(dl.mime, cssUrl)) continue;
      const cssText = dl.data.toString('utf8');
      const result = walkCss(cssText, {
        cssBaseUrl: cssUrl,
        visit: (_raw, abs) => {
          collected.add(abs);
          return abs;
        },
      });
      for (const u of result.collectedUrls) {
        if (!allDownloaded.has(u) && !seenCss.has(u)) {
          nextUrls.push(u);
          seenCss.add(u);
        }
      }
    }
    if (nextUrls.length === 0) break;
    const more = await downloadMany(nextUrls, downloadOpts);
    for (const [k, v] of more) allDownloaded.set(k, v);
    cssQueue = nextUrls.filter((u) => isCssLikely(u, allDownloaded.get(u)?.mime));
  }

  const manifest: AssetManifest = emptyManifest();
  let bytesTotal = 0;
  for (const url of collected) {
    const dl = allDownloaded.get(url);
    const entry: AssetEntry = dl ? makeEntryFromDownloaded(dl) : makeEntryFromUrl(url);
    manifest.entries.push(entry);
    manifest.byUrl[url] = entry.id;
    bytesTotal += entry.size;
  }

  return {
    html: opts.rewriteHtml === false ? html : $.html(),
    assets: manifest,
    bytesTotal,
  };
}

function isCssMime(mime: string, url: string): boolean {
  if (mime.toLowerCase().includes('css')) return true;
  return url.toLowerCase().includes('.css');
}

function isCssLikely(url: string, mime?: string): boolean {
  if (mime && mime.toLowerCase().includes('css')) return true;
  return url.toLowerCase().includes('.css');
}
