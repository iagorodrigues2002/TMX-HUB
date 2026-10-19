export interface TrackingOverviewTotals {
  fees_missing_operations?: number;
  paid_orders: number;
  gross_revenue_brl_minor: string;
  gross_revenue_usd_minor: string;
  failed_orders: number;
  failed_revenue_brl_minor: string;
  failed_revenue_usd_minor: string;
  refunded_orders: number;
  refunded_revenue_brl_minor: string;
  refunded_revenue_usd_minor: string;
  chargeback_orders: number;
  chargeback_revenue_brl_minor: string;
  chargeback_revenue_usd_minor: string;
  fees_brl_minor: string;
  fees_usd_minor: string;
  refund_chargeback_fee_count: number;
  refund_chargeback_fee_brl_minor: string;
  refund_chargeback_fee_usd_minor: string;
  reserve_brl_minor: string;
  reserve_usd_minor: string;
  net_revenue_brl_minor: string;
  net_revenue_usd_minor: string;
  net_available_brl_minor: string;
  net_available_usd_minor: string;
}

export interface TrackingOverviewOffer extends TrackingOverviewTotals {
  offer_id: string;
  offer_name: string;
  owner_id: string;
}

export interface TrackingOverviewAccount {
  owner_id: string;
  owner_name: string;
  is_current_user: boolean;
  offers: TrackingOverviewOffer[];
  totals: TrackingOverviewTotals;
  gateways?: Array<{
    provider: string;
    transactions: number;
    fronts: number;
    upsells: number;
    gross_brl_minor: string;
    missing_amounts: number;
    fees_brl_minor?: number;
    reserve_brl_minor?: number;
    penalty_brl_minor?: number;
    fees_missing_operations?: number;
  }>;
  syzepay_pending?: Array<{ company_name: string; pending_events: number }>;
}

export interface SyzepayFees {
  fee_source?: 'configured' | 'webhook';
  fee_pct: number;
  fixed_fee_minor: number;
  fee_currency: string;
  reserve_pct: number;
  chargeback_fee_minor: number;
  refund_fee_minor: number;
}
