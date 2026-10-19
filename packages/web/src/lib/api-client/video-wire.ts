import type { VslJobStatus } from '@page-cloner/shared';
import type { VslManifestKind } from '@page-cloner/shared';
import type { VslJob } from '@page-cloner/shared';
import type { FunnelJobStatus } from '@page-cloner/shared';
import type { FunnelPage } from '@page-cloner/shared';
import type { FunnelJob } from '@page-cloner/shared';

// ---- VSL job (snake/camel) ----

export interface VslJobWire {
  id: string;
  url: string;
  status: VslJobStatus;
  progress: number;
  manifest_url?: string;
  manifest_kind?: VslManifestKind;
  bytes?: number;
  duration_sec?: number;
  filename?: string;
  storage_key?: string;
  cloaker_detected?: boolean;
  white_manifest_url?: string;
  white_filename?: string;
  white_storage_key?: string;
  white_bytes?: number;
  white_download_url?: string;
  expires_at?: string;
  download_url?: string;
  error?: { code: string; message: string };
  created_at: string;
  updated_at: string;
}

export interface VslJobView extends VslJob {
  downloadUrl?: string;
  whiteDownloadUrl?: string;
  error?: { code: string; message: string };
}

export function fromVslJobWire(w: VslJobWire): VslJobView {
  return {
    id: w.id,
    url: w.url,
    status: w.status,
    progress: w.progress,
    manifestUrl: w.manifest_url,
    manifestKind: w.manifest_kind,
    bytes: w.bytes,
    durationSec: w.duration_sec,
    filename: w.filename,
    storageKey: w.storage_key,
    cloakerDetected: w.cloaker_detected,
    whiteManifestUrl: w.white_manifest_url,
    whiteFilename: w.white_filename,
    whiteStorageKey: w.white_storage_key,
    whiteBytes: w.white_bytes,
    expiresAt: w.expires_at,
    createdAt: w.created_at,
    updatedAt: w.updated_at,
    downloadUrl: w.download_url,
    whiteDownloadUrl: w.white_download_url,
    error: w.error,
  };
}

// ---- Funnel job (snake/camel) ----

export interface FunnelJobWire {
  id: string;
  root_url: string;
  status: FunnelJobStatus;
  progress: number;
  max_depth: number;
  max_pages: number;
  pages: FunnelPage[];
  total_bytes?: number;
  filename?: string;
  storage_key?: string;
  expires_at?: string;
  download_url?: string;
  error?: { code: string; message: string };
  created_at: string;
  updated_at: string;
}

export interface FunnelJobView extends FunnelJob {
  downloadUrl?: string;
  error?: { code: string; message: string };
}

export function fromFunnelJobWire(w: FunnelJobWire): FunnelJobView {
  return {
    id: w.id,
    rootUrl: w.root_url,
    status: w.status,
    progress: w.progress,
    maxDepth: w.max_depth,
    maxPages: w.max_pages,
    pages: w.pages ?? [],
    totalBytes: w.total_bytes,
    filename: w.filename,
    storageKey: w.storage_key,
    expiresAt: w.expires_at,
    downloadUrl: w.download_url,
    error: w.error,
    createdAt: w.created_at,
    updatedAt: w.updated_at,
  };
}
