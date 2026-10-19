import type { NicheView } from './niche-types.js';
import type { NicheWire } from './niche-types.js';
import { fromNicheWire } from './niche-types.js';
import { request } from './request.js';
import { uploadMultipart } from './upload.js';
export const endpoints = {
  // ---- Niches (Video Shield) ----
  async listNiches(): Promise<NicheView[]> {
    const wire = await request<{ niches: NicheWire[] }>('/v1/niches');
    return (wire.niches ?? []).map(fromNicheWire);
  },
  async createNiche(input: { name: string; description?: string }): Promise<NicheView> {
    const wire = await request<NicheWire>('/v1/niches', { method: 'POST', body: input });
    return fromNicheWire(wire);
  },
  async updateNiche(
    id: string,
    patch: { name?: string; description?: string },
  ): Promise<NicheView> {
    const wire = await request<NicheWire>(`/v1/niches/${id}`, { method: 'PATCH', body: patch });
    return fromNicheWire(wire);
  },
  async deleteNiche(id: string): Promise<void> {
    await request<void>(`/v1/niches/${id}`, { method: 'DELETE' });
  },
  async addNicheWhite(
    id: string,
    file: File,
    label?: string,
    onProgress?: (pct: number) => void,
  ): Promise<NicheView> {
    const fd = new FormData();
    // Fields BEFORE file — backend reads parts sequentially and stops at the
    // file to stream it. Fields after the file would never be parsed.
    if (label) fd.append('label', label);
    fd.append('file', file);
    const wire = await uploadMultipart<NicheWire>(`/v1/niches/${id}/whites`, fd, onProgress);
    return fromNicheWire(wire);
  },
  async deleteNicheWhite(nicheId: string, whiteId: string): Promise<NicheView> {
    const wire = await request<NicheWire>(`/v1/niches/${nicheId}/whites/${whiteId}`, {
      method: 'DELETE',
    });
    return fromNicheWire(wire);
  },
};
