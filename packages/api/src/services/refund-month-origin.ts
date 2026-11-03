import {
  type RefundOrder,
  emptyRefundTotals,
  finishRefundTotals,
  localDay,
  shiftDay,
} from './refund-analytics-support.js';

type RefundPurchaseMonthGroup = 'same_month' | 'previous_month' | 'older' | 'unknown';

function adjacentMonth(month: string, offset: number) {
  const date = new Date(`${month}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 7);
}

/** The source is already scoped and contains one row per order, not one row per receipt. */
export function buildRefundMonthOrigin(rows: RefundOrder[], from: string, to: string) {
  const months = [];
  for (let month = from.slice(0, 7); month <= to.slice(0, 7); month = adjacentMonth(month, 1)) {
    const firstDay = `${month}-01`;
    const lastDay = shiftDay(`${adjacentMonth(month, 1)}-01`, -1);
    const start = from > firstDay ? from : firstDay;
    const end = to < lastDay ? to : lastDay;
    const previousMonth = adjacentMonth(month, -1);
    const groups = (['same_month', 'previous_month', 'older', 'unknown'] as const).map((key) => ({
      key,
      purchase_month:
        key === 'same_month' ? month : key === 'previous_month' ? previousMonth : null,
      count: 0,
      brl_minor: 0,
      fee_brl_minor: 0,
      impact_brl_minor: 0,
      missing_brl_orders: 0,
      missing_fee_orders: 0,
      share_pct: null as number | null,
      refund_pct: null as number | null,
      impact_pct: null as number | null,
    }));
    months.push({
      month,
      from: start,
      to: end,
      partial_month: start !== firstDay || end !== lastDay,
      gross_brl_minor: 0,
      missing_gross_orders: 0,
      total: emptyRefundTotals(),
      groups,
    });
  }
  const byMonth = new Map(months.map((month) => [month.month, month]));
  const missingAmounts = new Map(months.map((month) => [month.month, new Set<string>()]));
  // One pass over the already-scoped orders, including long reporting ranges.
  for (const row of rows) {
    const paidDay = row.paid_at ? localDay(row.paid_at) : null;
    if (paidDay && paidDay >= from && paidDay <= to) {
      const month = byMonth.get(paidDay.slice(0, 7))!;
      month.total.sales++;
      if (row.amount_brl_minor === null) {
        month.missing_gross_orders++;
        missingAmounts.get(month.month)!.add(row.id);
      } else month.total.gross_brl_minor += row.amount_brl_minor;
    }
    if (!row.reversal_at) continue;
    const receiptDay = localDay(row.reversal_at);
    if (receiptDay < from || receiptDay > to) continue;
    const month = byMonth.get(receiptDay.slice(0, 7))!;
    month.total.count++;
    if (row.amount_brl_minor === null) missingAmounts.get(month.month)!.add(row.id);
    else month.total.brl_minor += row.amount_brl_minor;
    if (row.penalty_brl_minor === null) month.total.missing_fee_orders++;
    else month.total.fee_brl_minor += row.penalty_brl_minor;
    const purchase = row.delay_paid_at === undefined ? row.paid_at : row.delay_paid_at;
    const purchaseTime = purchase ? Date.parse(purchase) : Number.NaN;
    let key: RefundPurchaseMonthGroup = 'unknown';
    if (Number.isFinite(purchaseTime) && purchaseTime <= Date.parse(row.reversal_at)) {
      const purchaseMonth = localDay(new Date(purchaseTime)).slice(0, 7);
      const previousMonth = month.groups[1]!.purchase_month!;
      key =
        purchaseMonth === month.month
          ? 'same_month'
          : purchaseMonth === previousMonth
            ? 'previous_month'
            : purchaseMonth < previousMonth
              ? 'older'
              : 'unknown';
    }
    const group = month.groups.find((item) => item.key === key)!;
    group.count++;
    if (row.amount_brl_minor === null) group.missing_brl_orders++;
    else group.brl_minor += row.amount_brl_minor;
    if (row.penalty_brl_minor === null) group.missing_fee_orders++;
    else group.fee_brl_minor += row.penalty_brl_minor;
  }
  for (const month of months) {
    month.total.missing_brl_orders = missingAmounts.get(month.month)!.size;
    finishRefundTotals(month.total);
    month.gross_brl_minor = month.total.gross_brl_minor;
    const missingRefundAmounts = month.groups.some((group) => group.missing_brl_orders > 0);
    for (const group of month.groups) {
      group.impact_brl_minor = group.brl_minor + group.fee_brl_minor;
      group.share_pct =
        month.total.brl_minor > 0 && !missingRefundAmounts
          ? (group.brl_minor / month.total.brl_minor) * 100
          : null;
      group.refund_pct =
        month.gross_brl_minor > 0 && !month.missing_gross_orders && !group.missing_brl_orders
          ? (group.brl_minor / month.gross_brl_minor) * 100
          : null;
      group.impact_pct =
        group.refund_pct !== null && !group.missing_fee_orders
          ? (group.impact_brl_minor / month.gross_brl_minor) * 100
          : null;
    }
  }
  return {
    basis: 'first_confirmed_receipt' as const,
    timezone: 'America/Sao_Paulo' as const,
    months,
  };
}
