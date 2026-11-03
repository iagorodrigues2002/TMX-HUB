/** Financial analytics: one reversal per order, dated by its first confirmed receipt. */
export interface RefundOrder {
  id: string;
  offer_id: string;
  offer_name: string;
  provider: string;
  connection_name: string;
  product_name: string;
  paid_at: string | null;
  reversal_at: string | null;
  delay_paid_at?: string | null;
  delay_reversal_at?: string | null;
  observed_reversal_at?: string | null;
  amount_brl_minor: number | null;
  penalty_brl_minor: number | null;
  [key: string]: unknown;
}
const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
export const localDay = (date: string | Date) => dayFormatter.format(new Date(date));
export function validDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number(value.slice(0, 4)) > 0 &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value
  );
}
export function shiftDay(day: string, count: number) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + count);
  return d.toISOString().slice(0, 10);
}
export function bucketDay(day: string, interval: 'day' | 'week' | 'month') {
  if (interval === 'month') return `${day.slice(0, 7)}-01`;
  if (interval === 'week') {
    const dow = new Date(`${day}T12:00:00Z`).getUTCDay();
    return shiftDay(day, -((dow + 6) % 7));
  }
  return day;
}
export function emptyRefundTotals() {
  return {
    count: 0,
    brl_minor: 0,
    gross_brl_minor: 0,
    sales: 0,
    fee_brl_minor: 0,
    impact_brl_minor: 0,
    rate_pct: null as number | null,
    impact_pct: null as number | null,
    missing_brl_orders: 0,
    missing_fee_orders: 0,
  };
}
export function finishRefundTotals(t: ReturnType<typeof emptyRefundTotals>) {
  t.impact_brl_minor = t.brl_minor + t.fee_brl_minor;
  t.rate_pct =
    t.gross_brl_minor > 0 && !t.missing_brl_orders ? (t.brl_minor / t.gross_brl_minor) * 100 : null;
  t.impact_pct =
    t.gross_brl_minor > 0 && !t.missing_brl_orders && !t.missing_fee_orders
      ? (t.impact_brl_minor / t.gross_brl_minor) * 100
      : null;
  return t;
}
