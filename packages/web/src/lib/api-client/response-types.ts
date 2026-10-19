// The API uses snake_case in the wire format per OpenAPI; shared types use
// camelCase. The client converts at the boundary so the rest of the app
// stays in TS-idiomatic shape.

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    next_cursor: string | null;
    limit: number;
    total_estimate?: number;
  };
}

export interface ListResult<T> {
  data: T[];
  nextCursor: string | null;
  limit: number;
  totalEstimate?: number;
}

export interface BulkLinkUpdateResult {
  matched: number;
  updated: number;
  affectedIds: string[];
}

export type TrackingPeriod = { from: string; to: string };

export type RefundBreakdown = {
  refunded_orders: number;
  chargeback_orders: number;
  refunded_brl_minor: number;
  chargeback_brl_minor: number;
  count: number;
  brl_minor: number;
};

export type RefundFinancialTotals = {
  count: number;
  brl_minor: number;
  gross_brl_minor: number;
  sales: number;
  rate_pct: number | null;
  impact_brl_minor: number;
  impact_pct: number | null;
  fee_brl_minor: number;
  missing_brl_orders: number;
  missing_fee_orders: number;
};

export type RefundRanking = {
  key: string;
  label: string;
  sales: number;
  gross_brl_minor: number;
  count: number;
  brl_minor: number;
  rate_pct: number | null;
  fee_brl_minor: number;
  impact_brl_minor: number;
};

export function trackingPeriodParams(period?: string | TrackingPeriod) {
  const params = new URLSearchParams();
  if (typeof period === 'string') params.set('date', period);
  else if (period) {
    params.set('from', period.from);
    params.set('to', period.to);
  }
  return params;
}
