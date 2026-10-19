import { env } from '../env.js';
import { ApiError } from '../query-client.js';
import type { ShieldCompressionMode } from './media-types.js';
import type { ShieldJobView } from './media-types.js';
import type { ShieldJobWire } from './media-types.js';
import { fromShieldJobWire } from './media-types.js';
import { request } from './request.js';
import { authToken } from './request.js';
import { uploadMultipart } from './upload.js';
export const endpoints = {
  // ---- Shield jobs ----
  async createShieldJob(
    args: {
      file: File;
      nicheId?: string;
      useWhiteAudio?: boolean;
      whiteVolumeDb?: number;
      compression?: ShieldCompressionMode;
      verifyTranscript?: boolean;
    },
    onProgress?: (pct: number) => void,
  ): Promise<ShieldJobView> {
    const fd = new FormData();
    // Fields MUST come before the file — backend stops iterating at the file
    // part to stream it; later fields would never be parsed.
    fd.append('use_white_audio', args.useWhiteAudio === false ? '0' : '1');
    if (args.useWhiteAudio !== false && args.nicheId) fd.append('niche_id', args.nicheId);
    if (args.whiteVolumeDb !== undefined) fd.append('white_volume_db', String(args.whiteVolumeDb));
    if (args.compression) fd.append('compression', args.compression);
    if (args.verifyTranscript) fd.append('verify_transcript', '1');
    fd.append('file', args.file);
    const wire = await uploadMultipart<ShieldJobWire>('/v1/shield-jobs', fd, onProgress);
    return fromShieldJobWire(wire);
  },
  async getShieldJob(id: string, signal?: AbortSignal): Promise<ShieldJobView> {
    const wire = await request<ShieldJobWire>(`/v1/shield-jobs/${id}`, { signal });
    return fromShieldJobWire(wire);
  },
  async listShieldJobs(): Promise<ShieldJobView[]> {
    const wire = await request<{ jobs: ShieldJobWire[] }>('/v1/shield-jobs');
    return (wire.jobs ?? []).map(fromShieldJobWire);
  },
  async deleteShieldJob(id: string): Promise<void> {
    await request<void>(`/v1/shield-jobs/${id}`, { method: 'DELETE' });
  },
  /**
   * Baixa um zip com os outputs dos jobs selecionados. Streama do servidor pra
   * blob no browser e dispara download. Limite atual: 100 jobs / chamada.
   */
  async bulkDownloadShieldJobs(ids: string[]): Promise<{ filename: string; bytes: number }> {
    const baseUrl = env.NEXT_PUBLIC_API_URL;
    const token = authToken.get();
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${baseUrl}/v1/shield-jobs/bulk-download`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const j = await res.json();
        msg =
          (j as { detail?: string; message?: string }).detail ??
          (j as { message?: string }).message ??
          msg;
      } catch {}
      throw new ApiError(msg, res.status);
    }
    const blob = await res.blob();
    // Tira nome do header Content-Disposition.
    const cd = res.headers.get('content-disposition') || '';
    const m = cd.match(/filename="([^"]+)"/);
    const filename = m?.[1] ?? `shield-batch-${new Date().toISOString().slice(0, 10)}.zip`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return { filename, bytes: blob.size };
  },
};
