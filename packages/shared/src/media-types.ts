// ---- Video Shield (cloaker) ----

/**
 * A "niche" is a category of white-audio scripts (e.g. "Saúde", "Finanças").
 * Each niche owns one or more white audios; when a video is shielded, one
 * of the niche's whites is randomly picked and mixed in.
 */
export interface NicheWhite {
  id: string;
  /** Original filename when uploaded. */
  filename: string;
  /** R2 storage key. */
  storageKey: string;
  /** Bytes of the audio file. */
  bytes: number;
  /** Optional human label (defaults to filename). */
  label?: string;
  createdAt: string;
}

export interface Niche {
  id: string;
  userId: string;
  name: string;
  description?: string;
  whites: NicheWhite[];
  createdAt: string;
  updatedAt?: string;
}

export type ShieldCompressionMode = 'none' | 'lossless' | 'balanced' | 'small';

export type ShieldJobStatus = 'queued' | 'processing' | 'verifying' | 'ready' | 'failed';

export type ShieldVerifyStatus = 'pending' | 'done' | 'failed' | 'skipped';

export interface ShieldJob {
  id: string;
  userId: string;
  /** Source video stored in R2 (input). */
  inputStorageKey: string;
  inputFilename: string;
  inputBytes: number;
  /** Niche selected for this job. */
  nicheId: string;
  nicheName: string;
  /** White audio actually picked (random) for this job. */
  whiteId: string;
  whiteLabel: string;
  /** White audio gain in dB (negative; e.g. -22). */
  whiteVolumeDb: number;
  /** False processes only the phase inversion, without mixing a white track. */
  useWhiteAudio: boolean;
  /** Compression mode applied. */
  compression: ShieldCompressionMode;
  /** Whether to run AssemblyAI verification on the output. */
  verifyTranscript: boolean;
  status: ShieldJobStatus;
  /** Output video storage key (only when ready). */
  outputStorageKey?: string;
  outputFilename?: string;
  outputBytes?: number;
  /** Optional transcript from AssemblyAI verification. */
  transcript?: string;
  transcriptStatus?: ShieldVerifyStatus;
  /** Error from AssemblyAI when transcriptStatus === 'failed'. */
  transcriptError?: string;
  /** Free-form error text when status === 'failed'. */
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateNicheRequest {
  name: string;
  description?: string;
}

export interface UpdateNicheRequest {
  name?: string;
  description?: string;
}

export interface CreateShieldJobRequest {
  niche_id?: string;
  use_white_audio?: boolean; // default true
  white_volume_db?: number; // default -22
  compression?: ShieldCompressionMode; // default 'none'
  verify_transcript?: boolean; // default false
}

// ---- Creative Studio ----

export type MediaCompressionMode = 'none' | 'balanced' | 'small';
export type MediaAspectRatio = 'original' | '9:16' | '4:5' | '1:1';
export type MediaExtensionMode = 'none' | 'loop' | 'freeze';
export type MediaJobStatus = 'queued' | 'processing' | 'verifying' | 'ready' | 'failed';

export interface MediaJob {
  id: string;
  userId: string;
  inputStorageKey: string;
  inputFilename: string;
  inputBytes: number;
  compression: MediaCompressionMode;
  aspectRatio: MediaAspectRatio;
  stripMetadata: boolean;
  normalizeAudio: boolean;
  extensionMode: MediaExtensionMode;
  targetSeconds?: number;
  phaseCancel: boolean;
  useWhiteAudio: boolean;
  nicheId?: string;
  nicheName?: string;
  whiteId?: string;
  whiteLabel?: string;
  whiteVolumeDb?: number;
  verifyTranscript: boolean;
  status: MediaJobStatus;
  outputStorageKey?: string;
  outputFilename?: string;
  outputBytes?: number;
  transcript?: string;
  transcriptStatus?: ShieldVerifyStatus;
  transcriptError?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMediaJobRequest {
  compression?: MediaCompressionMode;
  aspect_ratio?: MediaAspectRatio;
  strip_metadata?: boolean;
  normalize_audio?: boolean;
  extension_mode?: MediaExtensionMode;
  target_seconds?: number;
  phase_cancel?: boolean;
  use_white_audio?: boolean;
  niche_id?: string;
  white_volume_db?: number;
  verify_transcript?: boolean;
}
