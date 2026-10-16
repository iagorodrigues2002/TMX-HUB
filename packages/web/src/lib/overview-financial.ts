export interface OverviewFinancialRow {
  fees_missing_operations?: number;
  offer_id: string;
  gross_revenue_brl_minor?: string;
  fees_brl_minor: string;
  reserve_brl_minor: string;
  net_revenue_brl_minor: string;
  net_available_brl_minor: string;
  refunded_revenue_brl_minor: string;
  chargeback_revenue_brl_minor: string;
  refund_chargeback_fee_brl_minor: string;
}

/** Period flow ratio, not the eventual refund rate of a purchase cohort. */
export function refundRevenuePercentage(reversed: number, gross: number): number | null {
  return Number.isFinite(reversed) && Number.isFinite(gross) && gross > 0
    ? (reversed / gross) * 100
    : null;
}

export function formatRefundRevenuePercentage(value: number | null) {
  return value === null
    ? '—'
    : `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value)}%`;
}

/** Aggregate only the offers in this owner/currency block; missing data is not zero. */
export function overviewFinancials(offerIds: string[], rows: OverviewFinancialRow[] | undefined) {
  if (!rows || !offerIds.length) return null;
  const selected = offerIds.map((id) => rows.find((row) => row.offer_id === id));
  if (selected.some((row) => !row)) return null;
  const sum = (field: keyof Omit<OverviewFinancialRow, 'offer_id'>) =>
    selected.reduce((total, row) => total + Number(row![field]), 0) / 100;
  const missing = selected.reduce((total, row) => total + (row?.fees_missing_operations ?? 0), 0);
  const result = {
    gross: selected.every((row) => row?.gross_revenue_brl_minor !== undefined)
      ? sum('gross_revenue_brl_minor')
      : null,
    fees: sum('fees_brl_minor'),
    reserve: sum('reserve_brl_minor'),
    net: sum('net_revenue_brl_minor'),
    available: sum('net_available_brl_minor'),
    refunds: sum('refunded_revenue_brl_minor') + sum('chargeback_revenue_brl_minor'),
    penalties: sum('refund_chargeback_fee_brl_minor'),
  };
  const impact = result.refunds + result.penalties;
  const metrics = {
    ...result,
    impact,
    refundPercentage:
      result.gross === null ? null : refundRevenuePercentage(result.refunds, result.gross),
    impactPercentage: result.gross === null ? null : refundRevenuePercentage(impact, result.gross),
  };
  return missing > 0
    ? {
        ...metrics,
        impact: null,
        impactPercentage: null,
        net: null,
        available: null,
        missingFeeOperations: missing,
      }
    : metrics;
}
