'use client';

import type { ShieldCompressionMode } from '@/lib/api-client';

export const COMPRESSION_OPTIONS: Array<{
  value: ShieldCompressionMode;
  label: string;
  hint: string;
}> = [
  { value: 'none', label: 'Sem compressão', hint: 'mais rápido — não re-encoda o vídeo' },
  { value: 'lossless', label: 'Sem perda visível', hint: 'CRF 18 — qualidade máxima' },
  { value: 'balanced', label: 'Equilibrado', hint: 'CRF 23 — redução típica de 50%' },
  { value: 'small', label: 'Tamanho mínimo', hint: 'CRF 28 — perda visível em close inspect' },
];

/** Maximum simultaneous uploads to keep network/UI sane. */
export const PARALLEL_UPLOADS = 5;

/** Extensões de vídeo/áudio aceitas dentro de um ZIP (case-insensitive). */
export const ALLOWED_MEDIA_EXT = new Set([
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

export function isZipFile(file: File): boolean {
  const ext = file.name.split('.').pop()?.toLowerCase();
  return (
    file.type === 'application/zip' || file.type === 'application/x-zip-compressed' || ext === 'zip'
  );
}

export function extOf(name: string): string {
  return (name.split('.').pop() || '').toLowerCase();
}

/**
 * Extrai vídeos/áudios de um ZIP no browser. Ignora pastas, arquivos ocultos
 * (.DS_Store, __MACOSX/) e qualquer extensão fora da whitelist. Retorna File[]
 * prontos pra entrar como slots normais.
 */
export async function extractMediaFromZip(zipFile: File): Promise<File[]> {
  const { default: JSZip } = await import('jszip');
  const buf = await zipFile.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);
  const out: File[] = [];
  const entries = Object.values(zip.files);
  for (const entry of entries) {
    if (entry.dir) continue;
    if (entry.name.startsWith('__MACOSX/')) continue;
    const baseName = entry.name.split('/').pop() || entry.name;
    if (!baseName || baseName.startsWith('.')) continue;
    const ext = extOf(baseName);
    if (!ALLOWED_MEDIA_EXT.has(ext)) continue;
    const blob = await entry.async('blob');
    const mime =
      ext === 'mp4' || ext === 'm4a'
        ? 'video/mp4'
        : ext === 'mov'
          ? 'video/quicktime'
          : ext === 'avi'
            ? 'video/x-msvideo'
            : ext === 'webm'
              ? 'video/webm'
              : ext === 'mkv'
                ? 'video/x-matroska'
                : ext === 'mp3'
                  ? 'audio/mpeg'
                  : ext === 'wav'
                    ? 'audio/wav'
                    : ext === 'aac'
                      ? 'audio/aac'
                      : 'application/octet-stream';
    out.push(new File([blob], baseName, { type: mime }));
  }
  return out;
}

export interface UploadSlot {
  id: string; // local unique id
  file: File;
  status: 'pending' | 'uploading' | 'done' | 'failed';
  progress: number; // 0..100
  jobId?: string;
  error?: string;
}

export function newSlotId(): string {
  return `up_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

export function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
