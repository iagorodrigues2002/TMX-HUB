import type { DashboardSummary } from './offer-analysis-types.js';
import type { OfferSnapshotsView } from './offer-types.js';
import type { OfferSnapshotsWire } from './offer-wire.js';
import { fromOfferSnapshotsWire } from './offer-wire.js';
import type { DashboardSummaryWire } from './offer-wire.js';
import { fromDashboardSummaryWire } from './offer-wire.js';
import { request } from './request.js';
export const endpoints = {
  async getOfferSnapshots(
    id: string,
    range?: { from?: string; to?: string },
  ): Promise<OfferSnapshotsView> {
    const params = new URLSearchParams();
    if (range?.from) params.set('from', range.from);
    if (range?.to) params.set('to', range.to);
    const qs = params.toString();
    const wire = await request<OfferSnapshotsWire>(
      `/v1/offers/${id}/snapshots${qs ? `?${qs}` : ''}`,
    );
    return fromOfferSnapshotsWire(wire);
  },

  async getDashboardSummary(range?: { from?: string; to?: string }): Promise<DashboardSummary> {
    const params = new URLSearchParams();
    if (range?.from) params.set('from', range.from);
    if (range?.to) params.set('to', range.to);
    const qs = params.toString();
    const wire = await request<DashboardSummaryWire>(`/v1/dashboard/summary${qs ? `?${qs}` : ''}`);
    return fromDashboardSummaryWire(wire);
  },

  async pageDiff(input: {
    url_a: string;
    url_b: string;
    render_mode?: 'static' | 'js';
  }): Promise<{
    url_a: { input: string; final: string; status: number; lines: number };
    url_b: { input: string; final: string; status: number; lines: number };
    render_mode: 'static' | 'js';
    duration_ms: number;
    summary: { added: number; removed: number; unchanged: number };
    entries: Array<{ op: 'equal' | 'add' | 'remove'; text: string }>;
  }> {
    return request('/v1/page-diff', { method: 'POST', body: input });
  },

  async fireWebhook(input: {
    url: string;
    method?: 'POST' | 'PUT' | 'PATCH';
    headers?: Record<string, string>;
    body: unknown;
    timeout_ms?: number;
  }): Promise<{
    ok: boolean;
    status: number;
    duration_ms: number;
    response_headers?: Record<string, string>;
    response_body?: string;
    error?: string;
    sent: { url: string; method: string; headers: Record<string, string>; body: string };
  }> {
    return request('/v1/webhook-test', { method: 'POST', body: input });
  },
};
