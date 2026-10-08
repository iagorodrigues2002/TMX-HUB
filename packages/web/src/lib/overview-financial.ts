export interface OverviewFinancialRow {
  offer_id: string;
  fees_brl_minor: string;
  reserve_brl_minor: string;
  net_revenue_brl_minor: string;
  net_available_brl_minor: string;
  refunded_revenue_brl_minor: string;
  chargeback_revenue_brl_minor: string;
  refund_chargeback_fee_brl_minor: string;
}

/** Aggregate only the offers in this owner/currency block; missing data is not zero. */
export function overviewFinancials(offerIds: string[], rows: OverviewFinancialRow[] | undefined) {
  if (!rows || !offerIds.length) return null;
  const selected = offerIds.map(id => rows.find(row => row.offer_id === id));
  if (selected.some(row => !row)) return null;
  const sum = (field: keyof Omit<OverviewFinancialRow, 'offer_id'>) =>
    selected.reduce((total, row) => total + Number(row![field]), 0) / 100;
  return {
    fees: sum('fees_brl_minor'), reserve: sum('reserve_brl_minor'),
    net: sum('net_revenue_brl_minor'), available: sum('net_available_brl_minor'),
    refunds: sum('refunded_revenue_brl_minor') + sum('chargeback_revenue_brl_minor'),
    penalties: sum('refund_chargeback_fee_brl_minor'),
  };
}
