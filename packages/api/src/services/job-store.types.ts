import type { BundleFormat, CloneOptions, CloneStatus } from '@page-cloner/shared';

export interface CloneMetadata {
  id: string;
  status: CloneStatus;
  sourceUrl: string;
  finalUrl?: string;
  webhookUrl?: string;
  options: CloneOptions;
  createdAt: string;
  updatedAt: string;
  renderedAt?: string;
  progress: number;
  forms: number;
  links: number;
  assets: number;
  bytes: number;
  errorCode?: string;
  errorMessage?: string;
  etag: string;
}

export interface BuildMetadata {
  id: string;
  cloneId: string;
  status: 'queued' | 'building' | 'ready' | 'failed';
  format: BundleFormat;
  inlineAssets: boolean;
  applyEdits: boolean;
  createdAt: string;
  updatedAt: string;
  bytes?: number;
  contentType?: string;
  sha256?: string;
  filename?: string;
  storageKey?: string;
  expiresAt?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface IdempotencyRecord {
  bodyHash: string;
  jobId: string;
}
