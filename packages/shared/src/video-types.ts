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
