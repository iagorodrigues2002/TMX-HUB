import { request } from './request.js';
import type { UpsellStageKey } from './tracking-types.js';
export const endpoints = {
  async getTrackingUpsells(
    id: string,
    period?: { from: string; to: string },
  ): Promise<{
    configured: boolean;
    install_code?: string;
    stages: Array<{
      id: string;
      stage_key: UpsellStageKey;
      name: string;
      slug: string;
      destination_url: string;
      connection_destinations: Record<string, string>;
      secure_url: string;
      install_code: string;
      enabled: boolean;
      redirects: number;
      eligible_buyers: number;
      page_views: number;
      offer_views: number;
      accepts: number;
      declines: number;
      exits: number;
      errors: number;
      purchases: number;
      identified_buyers: number;
    }>;
  }> {
    const query = period ? `?from=${period.from}&to=${period.to}` : '';
    return request(`/v1/offers/${id}/tracking/upsells${query}`);
  },

  async saveTrackingUpsell(
    id: string,
    body: {
      stage_key: UpsellStageKey;
      name: string;
      destination_url: string;
      connection_destinations?: Record<string, string>;
    },
  ): Promise<void> {
    await request(`/v1/offers/${id}/tracking/upsells`, { method: 'POST', body });
  },

  async getTrackingUpsellIdentities(
    id: string,
    period: { from?: string; to?: string; all?: boolean; limit?: number; offset?: number },
  ): Promise<{
    total: number;
    limit: number;
    offset: number;
    items: Array<{
      id: string;
      visitor_id: string;
      vendid: string;
      vendid_confirmed: boolean;
      provider?: string;
      validation_state?:
        | 'pending'
        | 'processing'
        | 'retry'
        | 'confirmed'
        | 'rejected'
        | 'failed'
        | 'not_applicable';
      validation_error?: string | null;
      validation_attempts?: number;
      approved_at: string;
      connection_name: string;
      has_upsell: boolean;
      first_seen_at: string;
      last_seen_at: string;
      links: Array<{
        gateway?: string;
        stage_id: string;
        stage_key: UpsellStageKey;
        name: string;
        already_purchased: boolean;
        url: string;
        force_url: string | null;
        manual_result: 'worked' | 'failed' | null;
        manual_checked_at: string | null;
        last_opening: {
          operator_id: string;
          operator_name: string | null;
          opened_at: string;
        } | null;
      }>;
    }>;
  }> {
    const pagination = new URLSearchParams({
      limit: String(period.limit ?? 50),
      offset: String(period.offset ?? 0),
    });
    if (period.from) pagination.set('from', period.from);
    if (period.to) pagination.set('to', period.to);
    if (period.all) pagination.set('all', 'true');
    return request(`/v1/offers/${id}/tracking/upsell-identities?${pagination.toString()}`);
  },

  async reconcileTrackingUpsellIdentities(id: string): Promise<{
    inspected: number;
    vendid_found: number;
    identities_stored: number;
    non_paid_removed: number;
  }> {
    return request(`/v1/offers/${id}/tracking/upsell-identities/reconcile`, { method: 'POST' });
  },

  async recoverFailedTrackingUpsellLinks(id: string): Promise<{
    inspected: number;
    recovered: number;
    recoverable: number;
    already_converted: number;
    temporary_failures: number;
    definitive_failures: number;
    skipped: number;
  }> {
    return request(`/v1/offers/${id}/tracking/upsell-identities/recover-failed`, {
      method: 'POST',
    });
  },

  async saveTrackingUpsellManualResult(
    id: string,
    orderId: string,
    stageId: string,
    result: 'worked' | 'failed',
  ): Promise<void> {
    await request(
      `/v1/offers/${id}/tracking/upsell-identities/${orderId}/stages/${stageId}/result`,
      { method: 'PUT', body: { result } },
    );
  },

  async openTrackingUpsell(
    id: string,
    orderId: string,
    stageId: string,
    clickId: string,
    viewOnly = false,
  ): Promise<{ attempt_id: string; url: string; opened_at: string }> {
    return request(
      `/v1/offers/${id}/tracking/upsell-identities/${orderId}/stages/${stageId}/open`,
      {
        method: 'POST',
        body: { click_id: clickId, view_only: viewOnly },
      },
    );
  },
};
