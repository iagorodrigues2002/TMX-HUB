import type { AssetKind } from '../types.js';

const SCHEMELESS_RE = /^\/\//;
const ABS_RE = /^[a-z][a-z0-9+.-]*:/i;

export function isAbsoluteUrl(url: string): boolean {
  return ABS_RE.test(url) || SCHEMELESS_RE.test(url);
}

export function shouldSkipUrl(url: string): boolean {
  if (!url) return true;
  const v = url.trim();
  if (v.length === 0) return true;
  if (v.startsWith('#')) return true;
  if (v.startsWith('data:')) return true;
  if (v.startsWith('blob:')) return true;
  if (v.startsWith('javascript:')) return true;
  if (v.startsWith('about:')) return true;
  if (v.startsWith('mailto:')) return true;
  if (v.startsWith('tel:')) return true;
  return false;
}

export function resolveUrl(input: string, base: string): string {
  const v = input.trim();
  if (SCHEMELESS_RE.test(v)) {
    let scheme = 'https:';
    try {
      const u = new URL(base);
      scheme = u.protocol;
    } catch {
      // ignore
    }
    return `${scheme}${v}`;
  }
  try {
    return new URL(v, base).toString();
  } catch {
    return v;
  }
}

const EXT_KIND: Record<string, AssetKind> = {
  '.png': 'image',
  '.jpg': 'image',
  '.jpeg': 'image',
  '.webp': 'image',
  '.gif': 'image',
  '.svg': 'image',
  '.avif': 'image',
  '.ico': 'image',
  '.bmp': 'image',
  '.css': 'stylesheet',
  '.woff': 'font',
  '.woff2': 'font',
  '.ttf': 'font',
  '.otf': 'font',
  '.eot': 'font',
  '.mp4': 'media',
  '.webm': 'media',
  '.mp3': 'media',
  '.wav': 'media',
  '.ogg': 'media',
};

const MIME_KIND_PREFIX: Array<[RegExp, AssetKind]> = [
  [/^image\//, 'image'],
  [/^font\//, 'font'],
  [/^video\//, 'media'],
  [/^audio\//, 'media'],
];

const MIME_KIND_EXACT: Record<string, AssetKind> = {
  'text/css': 'stylesheet',
  'application/font-woff': 'font',
  'application/font-woff2': 'font',
  'application/x-font-ttf': 'font',
  'application/x-font-otf': 'font',
  'application/vnd.ms-fontobject': 'font',
};

export function kindFromUrl(url: string): AssetKind {
  try {
    const u = new URL(url);
    const path = u.pathname.toLowerCase();
    const dot = path.lastIndexOf('.');
    if (dot >= 0) {
      const ext = path.slice(dot);
      const k = EXT_KIND[ext];
      if (k) return k;
    }
  } catch {
    // ignore
  }
  return 'other';
}

export function kindFromMime(mime: string, urlFallback?: string): AssetKind {
  const m = mime.toLowerCase().split(';')[0]?.trim() ?? '';
  const exact = MIME_KIND_EXACT[m];
  if (exact) return exact;
  for (const [re, k] of MIME_KIND_PREFIX) {
    if (re.test(m)) return k;
  }
  return urlFallback ? kindFromUrl(urlFallback) : 'other';
}

export function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}
