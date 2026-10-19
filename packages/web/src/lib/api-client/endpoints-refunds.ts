import { request } from './request.js';
import type { RefundFinancialTotals } from './response-types.js';
import type { RefundRanking } from './response-types.js';
export const endpoints = {
  async getRefundsDashboard(
    from: string,
    to: string,
    offerId?: string,
    product?: string,
    vendepay?: 'mainex' | 'cobrak',
    options?: { interval?: 'day' | 'week' | 'month'; provider?: string },
  ): Promise<{
    from: string;
    to: string;
    time_zone: string;
    providers: string[];
    items_limit: number;
    trend: Array<{
      date: string;
      count: number;
      brl_minor: number;
      gross_brl_minor: number;
      rate_pct: number | null;
      fee_brl_minor: number;
      impact_brl_minor: number;
      moving_average_brl_minor: number;
    }>;
    comparison: {
      previous_from: string;
      previous_to: string;
      previous: RefundFinancialTotals;
      amount_change_pct: number | null;
      rate_change_pp: number | null;
    };
    cohorts: Array<{
      month: string;
      sales: number;
      gross_brl_minor: number;
      count: number;
      brl_minor: number;
      rate_pct: number | null;
      immature: boolean;
    }>;
    rankings: { offers: RefundRanking[]; gateways: RefundRanking[]; products: RefundRanking[] };
    delay: {
      mean_days: number | null;
      median_days: number | null;
      sample_count?: number;
      missing_paid_at?: number;
      missing_reversal_at?: number;
      negative_delay_orders?: number;
      buckets: Array<{ label: string; count: number }>;
    };
    observed_delay?: {
      mean_days: number | null;
      median_days: number | null;
      sample_count?: number;
      missing_paid_at?: number;
      missing_reversal_at?: number;
      negative_delay_orders?: number;
      buckets: Array<{ label: string; count: number }>;
    };
    offers: Array<RefundFinancialTotals & { offer_id: string; offer_name: string }>;
    products: Array<RefundFinancialTotals & { product_name: string }>;
    vendepays: Array<RefundFinancialTotals & { connection_name: string }>;
    daily: Array<RefundFinancialTotals & { date: string }>;
    items: Array<{
      id: string;
      offer_id: string;
      offer_name: string;
      connection_name: string;
      external_id: string;
      status: 'refunded' | 'chargeback';
      amount_brl_minor: number | null;
      brl_minor: number | null;
      product_name: string;
      order_kind: string;
      lifecycle_at: string;
      paid_at?: string | null;
      delay_paid_at?: string | null;
      delay_reversal_at?: string | null;
      observed_reversal_at?: string | null;
      reversal_date_known?: boolean;
      buyer: { name?: string; email?: string };
    }>;
    totals: RefundFinancialTotals;
  }> {
    const params = new URLSearchParams({ from, to });
    if (offerId) params.set('offer_id', offerId);
    if (product) params.set('product', product);
    if (vendepay) params.set('vendepay', vendepay);
    if (options?.interval) params.set('interval', options.interval);
    if (options?.provider) params.set('provider', options.provider);
    return request(`/v1/tracking/refunds-dashboard?${params.toString()}`);
  },

  async getTrackingDiagnostics(id: string): Promise<{
    managed: boolean;
    database: 'ready' | 'unavailable';
    migrations: 'ready' | 'updating' | 'unavailable';
    encryption: 'ready' | 'unavailable';
    schema_version?: number;
    last_event_at?: string;
    last_order_at?: string;
    meta: { pending: number; failed: number };
    utmify: {
      destination_configured: boolean;
      destination_enabled: boolean;
      worker_running: boolean;
      pending: number;
      failed: number;
      dead: number;
      delivered: number;
      last_delivered_at: string | null;
      last_error: string | null;
      hint: string | null;
    };
    detail: string;
  }> {
    return request(`/v1/offers/${id}/tracking/diagnostics`);
  },
};
