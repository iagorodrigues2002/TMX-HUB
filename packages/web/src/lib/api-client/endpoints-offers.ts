import type { InspectResult } from '@page-cloner/shared';
import type { IntradaySummaryView } from './offer-analysis-types.js';
import type { IntradayRangeSummaryView } from './offer-analysis-types.js';
import type { OfferView } from './offer-types.js';
import type { OfferStatus } from './offer-types.js';
import type { OfferWire } from './offer-wire.js';
import { fromOfferWire } from './offer-wire.js';
import { request } from './request.js';
import type { FunnelJobView } from './video-wire.js';
import type { FunnelJobWire } from './video-wire.js';
import { fromFunnelJobWire } from './video-wire.js';
export const endpoints = {
  async inspectPage(url: string, signal?: AbortSignal): Promise<InspectResult> {
    return request<InspectResult>('/v1/inspect', { method: 'POST', body: { url }, signal });
  },

  async createFunnelJob(input: {
    url: string;
    max_depth?: number;
    max_pages?: number;
  }): Promise<FunnelJobView> {
    const wire = await request<FunnelJobWire>('/v1/funnel-jobs', {
      method: 'POST',
      body: input,
    });
    return fromFunnelJobWire(wire);
  },

  async getFunnelJob(id: string, signal?: AbortSignal): Promise<FunnelJobView> {
    const wire = await request<FunnelJobWire>(`/v1/funnel-jobs/${id}`, { signal });
    return fromFunnelJobWire(wire);
  },

  // ---- Dashboards / Offers ----

  async listOffers(): Promise<OfferView[]> {
    const wire = await request<{ offers: OfferWire[] }>('/v1/offers');
    return (wire.offers ?? []).map(fromOfferWire);
  },

  async createOffer(input: {
    utmify_access_enabled?: boolean;
    name: string;
    company_name?: string;
    dashboard_id?: string;
    description?: string;
    status?: OfferStatus;
    utmify_login?: string;
    utmify_password?: string;
    member_ids?: string[];
  }): Promise<OfferView> {
    const wire = await request<OfferWire>('/v1/offers', { method: 'POST', body: input });
    return fromOfferWire(wire);
  },

  async updateOffer(
    id: string,
    patch: {
      name?: string;
      company_name?: string;
      dashboard_id?: string;
      description?: string;
      status?: OfferStatus;
      utmify_login?: string;
      utmify_password?: string;
      member_ids?: string[];
    },
  ): Promise<OfferView> {
    const wire = await request<OfferWire>(`/v1/offers/${id}`, { method: 'PATCH', body: patch });
    return fromOfferWire(wire);
  },

  async deleteOffer(id: string): Promise<void> {
    await request<void>(`/v1/offers/${id}`, { method: 'DELETE' });
  },

  async syncOffer(id: string): Promise<{
    offerId: string;
    syncedDays: number;
    ads: number;
    failedDays?: number;
    skipped?: boolean;
  }> {
    return request(`/v1/offers/${id}/sync`, { method: 'POST' });
  },

  async getUtmifyCapabilities(id: string): Promise<{
    resultKeys: string[];
    accountFields: Array<Record<string, string | number | boolean>>;
    currency?: string;
  }> {
    return request(`/v1/offers/${id}/utmify-capabilities`);
  },

  async getOfferIntraday(id: string, date?: string): Promise<IntradaySummaryView> {
    const query = date ? `?date=${encodeURIComponent(date)}` : '';
    return request(`/v1/offers/${id}/intraday${query}`);
  },

  async getOfferIntradayRange(
    id: string,
    from: string,
    to: string,
  ): Promise<IntradayRangeSummaryView> {
    const params = new URLSearchParams({ from, to });
    return request(`/v1/offers/${id}/intraday/range?${params.toString()}`);
  },
};
