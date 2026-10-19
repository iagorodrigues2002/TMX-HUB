import { env } from '../env.js';
import { ApiError } from '../query-client.js';
import type { CreateMediaJobInput } from './media-types.js';
import type { MediaJobView } from './media-types.js';
import { request } from './request.js';
import { authToken } from './request.js';
import { uploadMultipart } from './upload.js';
export const endpoints = {
  // ---- Creative Studio ----
  async createMediaJob(
    args: CreateMediaJobInput,
    onProgress?: (pct: number) => void,
  ): Promise<MediaJobView> {
    const fd = new FormData();
    fd.append('compression', args.compression);
    fd.append('aspect_ratio', args.aspectRatio);
    fd.append('strip_metadata', args.stripMetadata ? '1' : '0');
    fd.append('normalize_audio', args.normalizeAudio ? '1' : '0');
    fd.append('extension_mode', args.extensionMode);
    if (args.targetSeconds) fd.append('target_seconds', String(args.targetSeconds));
    fd.append('phase_cancel', args.phaseCancel ? '1' : '0');
    fd.append('use_white_audio', args.useWhiteAudio ? '1' : '0');
    if (args.phaseCancel && args.useWhiteAudio && args.nicheId) fd.append('niche_id', args.nicheId);
    if (args.phaseCancel && args.whiteVolumeDb !== undefined) {
      fd.append('white_volume_db', String(args.whiteVolumeDb));
    }
    if (args.phaseCancel && args.verifyTranscript) fd.append('verify_transcript', '1');
    fd.append('file', args.file);
    return uploadMultipart<MediaJobView>('/v1/media-jobs', fd, onProgress);
  },
  async listMediaJobs(): Promise<MediaJobView[]> {
    const wire = await request<{ jobs: MediaJobView[] }>('/v1/media-jobs');
    return wire.jobs ?? [];
  },
  async getMediaJob(id: string, signal?: AbortSignal): Promise<MediaJobView> {
    return request<MediaJobView>(`/v1/media-jobs/${id}`, { signal });
  },
  async downloadMediaJob(id: string): Promise<{ filename: string; bytes: number }> {
    const baseUrl = env.NEXT_PUBLIC_API_URL;
    const token = authToken.get();
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${baseUrl}/v1/media-jobs/${id}/download`, { headers });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new ApiError(
        (data as { detail?: string; message?: string }).detail ||
          (data as { message?: string }).message ||
          `HTTP ${res.status}`,
        res.status,
      );
    }
    const blob = await res.blob();
    const disposition = res.headers.get('content-disposition') || '';
    const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? `video-studio-${id}.mp4`;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return { filename, bytes: blob.size };
  },
  async deleteMediaJob(id: string): Promise<void> {
    await request<void>(`/v1/media-jobs/${id}`, { method: 'DELETE' });
  },
  async bulkDownloadMediaJobs(ids: string[]): Promise<{ filename: string; bytes: number }> {
    const baseUrl = env.NEXT_PUBLIC_API_URL;
    const token = authToken.get();
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${baseUrl}/v1/media-jobs/bulk-download`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) {
      let message = `HTTP ${res.status}`;
      try {
        const body = (await res.json()) as { detail?: string; message?: string };
        message = body.detail ?? body.message ?? message;
      } catch {}
      throw new ApiError(message, res.status);
    }
    const blob = await res.blob();
    const disposition = res.headers.get('content-disposition') || '';
    const filename =
      disposition.match(/filename="([^"]+)"/)?.[1] ??
      `video-studio-${new Date().toISOString().slice(0, 10)}.zip`;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return { filename, bytes: blob.size };
  },
};
