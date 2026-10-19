import type { ShieldJob } from '@page-cloner/shared';
import { z } from 'zod';

export const BulkDownloadBodySchema = z
  .object({ ids: z.array(z.string().min(1)).min(1).max(100) })
  .strict();

export const ALLOWED_VIDEO = new Set([
  'video/mp4',
  'video/quicktime',
  'video/x-msvideo',
  'video/webm',
  'video/x-matroska',
  // Allow audio-only too — the worker still applies phase-cancel to the audio.
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/m4a',
  'audio/x-m4a',
  'audio/aac',
  'audio/mp4',
]);

export const ALLOWED_EXT = new Set([
  'mp4',
  'mov',
  'avi',
  'webm',
  'mkv',
  'mp3',
  'wav',
  'm4a',
  'aac',
]);

/**
 * Resolve o MIME efetivo do arquivo. Browser/SO frequentemente entrega
 * mime vazio em drag-drop ou em alguns MP4s do macOS. Quando o mime
 * declarado falha na whitelist, cai pra detecção por extensão.
 * Retorna `null` se nem mime nem extensão são reconhecidos.
 */
export function resolveMime(declared: string, filename: string): string | null {
  const mime = (declared || '').toLowerCase();
  if (ALLOWED_VIDEO.has(mime)) return mime;
  const ext = (filename.split('.').pop() || '').toLowerCase();
  if (!ALLOWED_EXT.has(ext)) return null;
  switch (ext) {
    case 'mp4':
      return 'video/mp4';
    case 'mov':
      return 'video/quicktime';
    case 'avi':
      return 'video/x-msvideo';
    case 'webm':
      return 'video/webm';
    case 'mkv':
      return 'video/x-matroska';
    case 'mp3':
      return 'audio/mpeg';
    case 'wav':
      return 'audio/wav';
    case 'm4a':
      return 'audio/m4a';
    case 'aac':
      return 'audio/aac';
    default:
      return null;
  }
}

export const MAX_INPUT_BYTES = 500 * 1024 * 1024;
// 500MB
/** Cap total do bulk-download. ZIP é blob no browser — limita pra não estourar memória. */
export const MAX_BULK_ZIP_BYTES = 3 * 1024 * 1024 * 1024;
// 3GB

export function jobToWire(j: ShieldJob, downloadUrl?: string): Record<string, unknown> {
  return {
    id: j.id,
    status: j.status,
    niche: { id: j.nicheId, name: j.nicheName },
    white: { id: j.whiteId, label: j.whiteLabel, volume_db: j.whiteVolumeDb },
    use_white_audio: j.useWhiteAudio,
    compression: j.compression,
    verify_transcript: j.verifyTranscript,
    input: { filename: j.inputFilename, bytes: j.inputBytes },
    output:
      j.status === 'ready' && j.outputFilename
        ? {
            filename: j.outputFilename,
            bytes: j.outputBytes,
            download_url: downloadUrl,
          }
        : undefined,
    transcript: j.transcript,
    transcript_status: j.transcriptStatus,
    transcript_error: j.transcriptError,
    error: j.errorMessage,
    created_at: j.createdAt,
    updated_at: j.updatedAt,
  };
}

export function extFromMime(mime: string, fallbackName: string): string {
  if (mime === 'video/mp4' || mime === 'audio/mp4') return 'mp4';
  if (mime === 'video/quicktime') return 'mov';
  if (mime === 'video/x-msvideo') return 'avi';
  if (mime === 'video/webm') return 'webm';
  if (mime === 'video/x-matroska') return 'mkv';
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3';
  if (mime.includes('wav')) return 'wav';
  if (mime.includes('m4a') || mime.includes('aac')) return 'm4a';
  const fallback = (fallbackName.split('.').pop() || 'mp4').toLowerCase();
  return fallback.replace(/[^a-z0-9]/g, '') || 'mp4';
}
