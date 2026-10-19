export type ShieldCompressionMode = 'none' | 'lossless' | 'balanced' | 'small';

export type ShieldJobStatusView = 'queued' | 'processing' | 'verifying' | 'ready' | 'failed';

export type ShieldVerifyStatusView = 'pending' | 'done' | 'failed' | 'skipped';

export interface ShieldJobView {
  id: string;
  status: ShieldJobStatusView;
  niche: { id: string; name: string };
  white: { id: string; label: string; volumeDb: number };
  useWhiteAudio: boolean;
  compression: ShieldCompressionMode;
  verifyTranscript: boolean;
  input: { filename: string; bytes: number };
  output?: { filename: string; bytes: number; downloadUrl?: string };
  transcript?: string;
  transcriptStatus?: ShieldVerifyStatusView;
  transcriptError?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export type MediaCompressionMode = 'none' | 'balanced' | 'small';

export type MediaAspectRatio = 'original' | '9:16' | '4:5' | '1:1';

export type MediaExtensionMode = 'none' | 'loop' | 'freeze';

export interface CreateMediaJobInput {
  file: File;
  compression: MediaCompressionMode;
  aspectRatio: MediaAspectRatio;
  stripMetadata: boolean;
  normalizeAudio: boolean;
  extensionMode: MediaExtensionMode;
  targetSeconds?: number;
  phaseCancel: boolean;
  useWhiteAudio: boolean;
  nicheId?: string;
  whiteVolumeDb?: number;
  verifyTranscript?: boolean;
}

export interface MediaJobView {
  id: string;
  status: 'queued' | 'processing' | 'verifying' | 'ready' | 'failed';
  input: { filename: string; bytes: number };
  options: {
    compression: MediaCompressionMode;
    aspect_ratio: MediaAspectRatio;
    strip_metadata: boolean;
    normalize_audio: boolean;
    extension_mode: MediaExtensionMode;
    target_seconds?: number;
    phase_cancel: boolean;
    use_white_audio: boolean;
    niche?: { id: string; name?: string };
    white?: { id: string; label?: string; volume_db?: number };
    verify_transcript: boolean;
  };
  output?: { filename: string; bytes?: number; download_url?: string };
  transcript?: string;
  transcript_status?: ShieldVerifyStatusView;
  transcript_error?: string;
  error?: string;
  created_at: string;
  updated_at: string;
}

export interface ShieldJobWire {
  id: string;
  status: ShieldJobStatusView;
  niche: { id: string; name: string };
  white: { id: string; label: string; volume_db: number };
  use_white_audio?: boolean;
  compression: ShieldCompressionMode;
  verify_transcript: boolean;
  input: { filename: string; bytes: number };
  output?: { filename: string; bytes: number; download_url?: string };
  transcript?: string;
  transcript_status?: ShieldVerifyStatusView;
  transcript_error?: string;
  error?: string;
  created_at: string;
  updated_at: string;
}

export function fromShieldJobWire(w: ShieldJobWire): ShieldJobView {
  return {
    id: w.id,
    status: w.status,
    niche: w.niche,
    white: { id: w.white.id, label: w.white.label, volumeDb: w.white.volume_db },
    useWhiteAudio: w.use_white_audio ?? true,
    compression: w.compression,
    verifyTranscript: w.verify_transcript,
    input: w.input,
    output: w.output
      ? {
          filename: w.output.filename,
          bytes: w.output.bytes,
          downloadUrl: w.output.download_url,
        }
      : undefined,
    transcript: w.transcript,
    transcriptStatus: w.transcript_status,
    transcriptError: w.transcript_error,
    error: w.error,
    createdAt: w.created_at,
    updatedAt: w.updated_at,
  };
}
