import type {
  AssetEntry,
  AssetKind,
  AssetManifest,
  BundleOptions,
  CloneOptions,
  CloneState,
  Form,
  FormField,
  Link,
} from '@page-cloner/shared';

export type {
  AssetEntry,
  AssetKind,
  AssetManifest,
  BundleOptions,
  CloneOptions,
  CloneState,
  Form,
  FormField,
  Link,
};

export interface FetchOptions {
  renderMode?: 'static' | 'js';
  userAgent?: string;
  viewport?: { width: number; height: number };
  timeoutMs?: number;
  waitFor?: 'load' | 'domcontentloaded' | 'networkidle';
  extraHttpHeaders?: Record<string, string>;
  blockThirdParty?: boolean;
}

export interface FetchResult {
  html: string;
  finalUrl: string;
  statusCode: number;
  headers: Record<string, string>;
  detectedChallenge: ChallengeKind | null;
  renderedAt: string;
}

export type ChallengeKind = 'cloudflare' | 'captcha' | 'rate_limited' | 'unknown';

export interface SanitizeOptions {
  removeTracking?: boolean;
  stripTemplates?: boolean;
  allowDataAttributes?: boolean;
  extraTrackingHosts?: string[];
  keepScriptSrcs?: string[];
}

export interface SanitizeRemovalCounts {
  scripts: number;
  noscripts: number;
  templates: number;
  inlineHandlers: number;
  javascriptUrls: number;
  trackingPixels: number;
  iframeSrcdoc: number;
  cspMeta: number;
}

export interface SanitizeResult {
  html: string;
  removed: SanitizeRemovalCounts;
}

export interface ResolveAssetsOptions {
  download?: boolean;
  maxBytes?: number;
  maxConcurrency?: number;
  timeoutMs?: number;
  rewriteHtml?: boolean;
  extraTypes?: Partial<Record<string, AssetKind>>;
}

export interface ResolveAssetsResult {
  html: string;
  assets: AssetManifest;
  bytesTotal: number;
}

export interface DownloadedAsset {
  originalUrl: string;
  resolvedUrl: string;
  data: Buffer;
  mime: string;
  size: number;
  hash: string;
}

export interface CloneOpts extends CloneOptions {
  fetch?: FetchOptions;
  sanitize?: SanitizeOptions;
  assets?: ResolveAssetsOptions;
}
