export type AssetKind = 'image' | 'stylesheet' | 'font' | 'media' | 'other';

export interface AssetEntry {
  id: string;
  url: string;
  originalUrl: string;
  kind: AssetKind;
  mime: string;
  size: number;
  hash: string;
  storageKey?: string;
}

export interface AssetManifest {
  entries: AssetEntry[];
  byUrl: Record<string, string>;
}

export type FormMode = 'keep' | 'replace' | 'capture_redirect' | 'disable';

export interface FormField {
  name: string;
  type: string;
  value?: string;
  hidden: boolean;
  required: boolean;
}

export interface Form {
  id: string;
  selector: string;
  originalAction: string;
  currentAction: string;
  method: 'GET' | 'POST';
  mode: FormMode;
  redirectTo?: string;
  fields: FormField[];
}

export interface Link {
  id: string;
  selector: string;
  originalHref: string;
  currentHref: string;
  text: string;
  rel?: string;
  isExternal: boolean;
  isCta: boolean;
}

export type CloneStatus =
  | 'queued'
  | 'rendering'
  | 'sanitizing'
  | 'resolving_assets'
  | 'ready'
  | 'failed';

export type RenderMode = 'static' | 'js';
export type Escalation = 'off' | 'auto' | 'max';

export interface LinkReplacement {
  from: string;
  to: string;
}

export interface CloneOptions {
  renderMode?: RenderMode;
  inlineAssets?: boolean;
  userAgent?: string;
  viewport?: { width: number; height: number };
  escalation?: Escalation;
  webhookUrl?: string;
  linkReplacements?: LinkReplacement[];
  keepScriptSrcs?: string[];
}

export interface InspectCheckoutLink {
  href: string;
  text: string;
  occurrences: number;
}

export interface InspectHeadScript {
  src: string;
  type: string | null;
}

export interface InspectResult {
  url: string;
  finalUrl: string;
  checkoutLinks: InspectCheckoutLink[];
  headScripts: InspectHeadScript[];
  inlineScriptCount: number;
}

export interface CloneState {
  jobId: string;
  sourceUrl: string;
  finalUrl: string;
  status: CloneStatus;
  html: string;
  assets: AssetManifest;
  forms: Form[];
  links: Link[];
  createdAt: string;
  updatedAt: string;
  error?: { code: string; message: string };
}

export type BundleFormat = 'html' | 'zip';

export interface BundleOptions {
  format: BundleFormat;
  inlineAssets?: boolean;
  applyEdits?: boolean;
}

export type BuildStatus = 'queued' | 'building' | 'ready' | 'failed';

export interface BuildJob {
  id: string;
  jobId: string;
  status: BuildStatus;
  format: BundleFormat;
  downloadUrl?: string;
  bytes?: number;
  createdAt: string;
  updatedAt: string;
  error?: { code: string; message: string };
}

// ---- VSL Downloader ----

export type VslJobStatus =
  | 'queued'
  | 'analyzing'
  | 'extracting'
  | 'downloading'
  | 'processing'
  | 'uploading'
  | 'ready'
  | 'failed';

export type VslManifestKind = 'hls' | 'dash' | 'mp4';

export interface VslJob {
  id: string;
  url: string;
  status: VslJobStatus;
  progress: number;
  /** Black variant (paid traffic). When no cloaker, this is the only manifest. */
  manifestUrl?: string;
  manifestKind?: VslManifestKind;
  bytes?: number;
  durationSec?: number;
  filename?: string;
  storageKey?: string;
  /** True if the page returned a different manifest for organic vs paid traffic. */
  cloakerDetected?: boolean;
  /** White variant (organic traffic). Only present when cloakerDetected. */
  whiteManifestUrl?: string;
  whiteFilename?: string;
  whiteStorageKey?: string;
  whiteBytes?: number;
  expiresAt?: string;
  errorCode?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateVslJobRequest {
  url: string;
}

export interface VslObservedMedia {
  url: string;
  kind: 'hls' | 'dash' | 'mp4' | 'segment' | 'unknown';
  source: 'extension' | 'content-type' | 'body-sniff' | 'segment-inference';
}

// ---- Funnel Full Clone ----

export type FunnelJobStatus =
  | 'queued'
  | 'crawling'
  | 'packaging'
  | 'uploading'
  | 'ready'
  | 'failed';

export interface FunnelPage {
  url: string;
  /** BFS depth from the root URL (root = 0). */
  depth: number;
  /** 0-indexed visit order, used for the "01-...", "02-..." naming. */
  index: number;
  /** Display label inferred from the link that brought us here, or page <title>. */
  label: string;
  /** HTML byte size after sanitize/asset-resolve. */
  bytes?: number;
  /** Final URL after redirects. */
  finalUrl?: string;
  /** Discovery error, if any. */
  error?: string;
}

export interface FunnelJob {
  id: string;
  rootUrl: string;
  status: FunnelJobStatus;
  progress: number;
  maxDepth: number;
  maxPages: number;
  pages: FunnelPage[];
  totalBytes?: number;
  filename?: string;
  storageKey?: string;
  expiresAt?: string;
  errorCode?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateFunnelJobRequest {
  url: string;
  max_depth?: number;
  max_pages?: number;
}
