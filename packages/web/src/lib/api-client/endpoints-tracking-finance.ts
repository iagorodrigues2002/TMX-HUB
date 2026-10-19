import type { TrackingFeeSettings } from './offer-types.js';
import { request } from './request.js';
import type { TrackingPeriod } from './response-types.js';
import { trackingPeriodParams } from './response-types.js';
import type { TrackingOverviewOffer } from './tracking-overview-types.js';
import type { TrackingOverviewAccount } from './tracking-overview-types.js';
import type { TrackingOrderKind } from './tracking-types.js';
export const endpoints = {
  async getTrackingSummary(
    id: string,
    period?: string | TrackingPeriod,
  ): Promise<{
    date: string;
    time_zone: string;
    events: number;
    visitors: number;
    page_views: number;
    ad_clicks: number;
    connected_clicks: number;
    checkouts: number;
    checkout_events: number;
    orders: number;
    paid_orders: number;
    failed_orders: number;
    paid_buyers: number;
    upsell_orders: number;
    upsell_2_orders: number;
    upsell_3_orders: number;
    unmapped_paid_orders: number;
    orphan_orders: number;
    paid_revenue_minor: string;
    paid_revenue_brl_minor: string;
    paid_revenue_usd_minor: string;
    unconverted_paid_orders: number;
    refunded_orders: number;
    refunded_revenue_brl_minor: string;
    refunded_revenue_usd_minor: string;
    chargeback_orders: number;
    chargeback_revenue_brl_minor: string;
    chargeback_revenue_usd_minor: string;
    refund_chargeback_fee_count: number;
    refund_chargeback_fee_brl_minor: string;
    refund_chargeback_fee_usd_minor: string;
    webhooks_received: number;
    webhooks_quarantined: number;
    utmify_deliveries_attempted: number;
    utmify_deliveries_lost: number;
    fee_settings: TrackingFeeSettings;
    fee_vendepay_brl_minor: string;
    fee_vendepay_usd_minor: string;
    fee_extra_brl_minor: string;
    fee_extra_usd_minor: string;
    reserve_brl_minor: string;
    reserve_usd_minor: string;
    net_revenue_brl_minor: string;
    net_revenue_usd_minor: string;
    net_available_brl_minor: string;
    net_available_usd_minor: string;
  }> {
    const params = trackingPeriodParams(period);
    const query = params.size ? `?${params.toString()}` : '';
    return request(`/v1/offers/${id}/tracking/summary${query}`);
  },

  async getTrackingFeeSettings(id: string): Promise<TrackingFeeSettings> {
    return request(`/v1/offers/${id}/tracking/fee-settings`);
  },

  async updateTrackingFeeSettings(
    id: string,
    body: {
      vendepay_fee_pct: number;
      extra_fee_minor: number;
      extra_fee_currency: string;
      reserve_pct: number;
      reserve_days: number;
      payout_days: number;
    },
  ): Promise<TrackingFeeSettings> {
    return request(`/v1/offers/${id}/tracking/fee-settings`, { method: 'PATCH', body });
  },

  async getTrackingRefunds(
    id: string,
    period?: string | TrackingPeriod,
    page = 1,
  ): Promise<{
    date: string;
    time_zone: string;
    items: Array<{
      id: string;
      provider: string;
      external_id: string;
      status: 'refunded' | 'chargeback';
      amount_minor: number | null;
      currency: string | null;
      amount_brl_minor: string | null;
      buyer: { name?: string; email?: string; document?: string };
      order_kind: TrackingOrderKind;
      occurred_at: string;
      updated_at: string;
    }>;
    totals: {
      refunded_orders: number;
      refunded_revenue_brl_minor: string;
      chargeback_orders: number;
      chargeback_revenue_brl_minor: string;
    };
    pagination: { page: number; per_page: number; total: number; total_pages: number };
  }> {
    const params = trackingPeriodParams(period);
    if (page > 1) params.set('page', String(page));
    const query = params.toString();
    return request(`/v1/offers/${id}/tracking/refunds${query ? `?${query}` : ''}`);
  },

  async getTrackingOverview(
    from?: string,
    to?: string,
  ): Promise<{
    from: string;
    to: string;
    time_zone: string;
    offers: TrackingOverviewOffer[];
    accounts: TrackingOverviewAccount[];
    /** Always null: cross-account financial aggregation is prohibited. */
    totals: null;
  }> {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const query = params.toString();
    return request(`/v1/tracking/overview${query ? `?${query}` : ''}`);
  },
};
