import { request } from './request.js';
export const endpoints = {
  async getUpsellOperatorLogs(
    id: string,
    period?: { from: string; to: string },
  ): Promise<{
    scope: 'offer' | 'self' | 'all_offers';
    attempts: Array<{
      id: string;
      operator_id: string;
      operator_name?: string | null;
      order_id: string;
      stage_id: string;
      stage_key: string;
      provider: string;
      opened_at: string;
    }>;
    approvals: Array<{
      order_id: string;
      stage_key: string;
      provider: string;
      approved_at: string;
      amount_minor: number | null;
      currency: string | null;
      operator_id: string | null;
      attribution: string;
    }>;
    summary: Array<{
      operator_id: string;
      operator_name?: string | null;
      openings: number;
      confirmed_purchases: number;
      amounts: Array<{ currency: string | null; amount_minor: number | null }>;
    }>;
    unattributed_totals: Array<{
      currency: string | null;
      count: number;
      amount_minor: number | null;
    }>;
    attribution_notice: string;
  }> {
    const query = new URLSearchParams({ limit: '50', ...(period ?? {}) });
    const path = id
      ? `/v1/offers/${id}/tracking/upsell-operator-logs`
      : '/v1/tracking/upsell-operator-logs';
    return request(`${path}?${query.toString()}`);
  },

  async checkTrackingUpsellCompatibility(url: string): Promise<{
    compatible: boolean;
    state: 'recoverable' | 'already_converted' | 'temporary_failure' | 'definitive_failure';
    reason: string | null;
  }> {
    const checkUrl = new URL(url);
    checkUrl.pathname = `${checkUrl.pathname.replace(/\/$/, '')}/check`;
    return request(`${checkUrl.pathname}${checkUrl.search}`);
  },

  async updateTrackingUpsell(
    id: string,
    stageId: string,
    body: {
      name: string;
      destination_url: string;
      connection_destinations?: Record<string, string>;
      enabled?: boolean;
    },
  ): Promise<void> {
    await request(`/v1/offers/${id}/tracking/upsells/${stageId}`, { method: 'PATCH', body });
  },

  async deleteTrackingUpsell(id: string, stageId: string): Promise<void> {
    await request(`/v1/offers/${id}/tracking/upsells/${stageId}`, { method: 'DELETE' });
  },
};
