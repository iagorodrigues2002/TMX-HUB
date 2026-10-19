export function refundMoney(v: number | null | undefined, hidden: boolean) {
  return hidden
    ? '****'
    : v == null
      ? '—'
      : new Intl.NumberFormat('pt-BR', {
          style: 'currency',
          currency: 'BRL',
        }).format(v / 100);
}
export { RefundAnalytics } from './refunds-visualizations-refund-analytics';
export { RefundDelay } from './refunds-visualizations-refund-delay';
export { RefundRankingTable } from './refunds-visualizations-refund-ranking-table';
export { RefundTrend } from './refunds-visualizations-refund-trend';
export { refundPercent, type RefundReport } from './refunds-visualizations-support';
