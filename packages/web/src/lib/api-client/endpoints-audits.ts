import type { DigiAuditView } from './audit-types.js';
import type { DigiAuditWire } from './audit-types.js';
import { fromDigiAuditWire } from './audit-types.js';
import type { DigiAuditStatusView } from './audit-types.js';
import type { DigiAuditItemView } from './audit-types.js';
import { request } from './request.js';
export const endpoints = {
  // ---- Digistore24 Audits ----
  async listDigiAudits(): Promise<DigiAuditView[]> {
    const wire = await request<{ audits: DigiAuditWire[] }>('/v1/digi-audits');
    return (wire.audits ?? []).map(fromDigiAuditWire);
  },
  async createDigiAudit(input: {
    product_name: string;
    offer_id?: string;
  }): Promise<DigiAuditView> {
    const wire = await request<DigiAuditWire>('/v1/digi-audits', {
      method: 'POST',
      body: input,
    });
    return fromDigiAuditWire(wire);
  },
  async getDigiAudit(id: string, signal?: AbortSignal): Promise<DigiAuditView> {
    const wire = await request<DigiAuditWire>(`/v1/digi-audits/${id}`, { signal });
    return fromDigiAuditWire(wire);
  },
  async updateDigiAudit(
    id: string,
    patch: {
      product_name?: string;
      offer_id?: string;
      status?: DigiAuditStatusView;
      notes?: string;
      items?: Record<string, DigiAuditItemView>;
    },
  ): Promise<DigiAuditView> {
    const wire = await request<DigiAuditWire>(`/v1/digi-audits/${id}`, {
      method: 'PATCH',
      body: patch,
    });
    return fromDigiAuditWire(wire);
  },
  async deleteDigiAudit(id: string): Promise<void> {
    await request<void>(`/v1/digi-audits/${id}`, { method: 'DELETE' });
  },
};
