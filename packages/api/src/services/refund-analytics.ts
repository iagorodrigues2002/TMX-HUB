import {
  type RefundOrder,
  bucketDay,
  emptyRefundTotals,
  finishRefundTotals as finish,
  localDay,
  shiftDay,
} from './refund-analytics-support.js';
import { buildRefundMonthOrigin } from './refund-month-origin.js';

export {
  type RefundOrder,
  bucketDay,
  emptyRefundTotals,
  localDay,
  shiftDay,
  validDate,
} from './refund-analytics-support.js';
export { buildRefundMonthOrigin } from './refund-month-origin.js';
export function summarizeRefunds(rows: RefundOrder[], from: string, to: string) {
  const t = emptyRefundTotals();
  const missingAmounts = new Set<string>();
  for (const r of rows) {
    if (r.paid_at && localDay(r.paid_at) >= from && localDay(r.paid_at) <= to) {
      t.sales++;
      if (r.amount_brl_minor === null) missingAmounts.add(r.id);
      else t.gross_brl_minor += r.amount_brl_minor;
    }
    if (r.reversal_at && localDay(r.reversal_at) >= from && localDay(r.reversal_at) <= to) {
      t.count++;
      if (r.amount_brl_minor === null) missingAmounts.add(r.id);
      else t.brl_minor += r.amount_brl_minor;
      if (r.penalty_brl_minor === null) t.missing_fee_orders++;
      else t.fee_brl_minor += r.penalty_brl_minor;
    }
  }
  t.missing_brl_orders = missingAmounts.size;
  return finish(t);
}
export function summarizeRefundOrigins(rows: RefundOrder[], from: string, to: string) {
  const origin = (row: RefundOrder) =>
    row.origin === 'natural' || row.origin === 'assisted' ? row.origin : 'unknown';
  return {
    general: summarizeRefunds(rows, from, to),
    natural: summarizeRefunds(
      rows.filter((r) => origin(r) === 'natural'),
      from,
      to,
    ),
    assisted: summarizeRefunds(
      rows.filter((r) => origin(r) === 'assisted'),
      from,
      to,
    ),
    unknown: summarizeRefunds(
      rows.filter((r) => origin(r) === 'unknown'),
      from,
      to,
    ),
  };
}
function summarizeUndatedRefunds(rows: RefundOrder[]) {
  const totals = emptyRefundTotals();
  for (const row of rows) {
    if (!row.reversal_received_missing) continue;
    totals.count++;
    if (row.amount_brl_minor === null) totals.missing_brl_orders++;
    else totals.brl_minor += row.amount_brl_minor;
    if (row.penalty_brl_minor === null) totals.missing_fee_orders++;
    else totals.fee_brl_minor += row.penalty_brl_minor;
  }
  return { ...finish(totals), basis: 'all_history_without_confirmed_receipt' as const };
}

export function buildRefundAnalytics(
  rows: RefundOrder[],
  from: string,
  to: string,
  interval: 'day' | 'week' | 'month',
  today: string,
) {
  const span = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
  const previousTo = shiftDay(from, -1);
  const previousFrom = shiftDay(from, -span);
  const totals = summarizeRefunds(rows, from, to);
  const previous = summarizeRefunds(rows, previousFrom, previousTo);
  const groups = new Map<string, RefundOrder[]>();
  for (let day = from; day <= to; day = shiftDay(day, 1)) groups.set(bucketDay(day, interval), []);
  for (const r of rows) {
    const paidBucket = r.paid_at ? bucketDay(localDay(r.paid_at), interval) : null;
    const reversalBucket = r.reversal_at ? bucketDay(localDay(r.reversal_at), interval) : null;
    if (paidBucket && groups.has(paidBucket))
      groups
        .get(paidBucket)!
        .push({ ...r, reversal_at: paidBucket === reversalBucket ? r.reversal_at : null });
    if (reversalBucket && reversalBucket !== paidBucket && groups.has(reversalBucket))
      groups.get(reversalBucket)!.push({ ...r, paid_at: null });
  }
  const trend = [...groups.entries()].map(([date, selected]) => {
    return { date, ...summarizeRefunds(selected, from, to), moving_average_brl_minor: 0 };
  });
  trend.forEach((r, i) => {
    const window = trend.slice(Math.max(0, i - 6), i + 1);
    r.moving_average_brl_minor = Math.round(
      window.reduce((s, v) => s + v.brl_minor, 0) / window.length,
    );
  });
  const ranking = (field: 'offer_id' | 'provider' | 'product_name') => {
    const grouped = new Map<string, RefundOrder[]>();
    for (const r of rows) {
      const key = r[field];
      const group = grouped.get(key) ?? [];
      group.push(r);
      grouped.set(key, group);
    }
    return [...grouped]
      .map(([key, group]) => ({
        key,
        label: field === 'offer_id' ? group[0]!.offer_name : key,
        ...summarizeRefunds(group, from, to),
      }))
      .filter((r) => r.sales || r.count)
      .sort((a, b) => b.brl_minor - a.brl_minor);
  };
  const cohortMonths = [
    ...new Set(
      rows
        .filter((r) => r.paid_at && localDay(r.paid_at) >= from && localDay(r.paid_at) <= to)
        .map((r) => localDay(r.paid_at!).slice(0, 7)),
    ),
  ].sort();
  const cohorts = cohortMonths.map((month) => {
    const selected = rows.filter(
      (r) =>
        r.paid_at &&
        localDay(r.paid_at).slice(0, 7) === month &&
        localDay(r.paid_at) >= from &&
        localDay(r.paid_at) <= to,
    );
    const t = emptyRefundTotals();
    for (const r of selected) {
      t.sales++;
      if (r.amount_brl_minor === null) t.missing_brl_orders++;
      else t.gross_brl_minor += r.amount_brl_minor;
      if (r.reversal_at && localDay(r.reversal_at) <= today) {
        t.count++;
        if (r.amount_brl_minor !== null) t.brl_minor += r.amount_brl_minor;
        if (r.penalty_brl_minor === null) t.missing_fee_orders++;
        else t.fee_brl_minor += r.penalty_brl_minor;
      }
    }
    const nextMonth = new Date(`${month}-01T12:00:00Z`);
    nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
    const age = Math.floor((Date.parse(today) - nextMonth.getTime()) / 86400000);
    return { month, ...finish(t), immature: age < 90, maturation_days: 90, as_of: today };
  });
  const reversed = rows.filter(
    (r) => r.reversal_at && localDay(r.reversal_at) >= from && localDay(r.reversal_at) <= to,
  );
  const delaySummary = (observed = false) => {
    const purchaseDate = (r: RefundOrder) =>
      r.delay_paid_at === undefined ? r.paid_at : r.delay_paid_at;
    const reversalDate = (r: RefundOrder) =>
      observed
        ? r.observed_reversal_at
        : r.delay_reversal_at === undefined
          ? r.reversal_at
          : r.delay_reversal_at;
    const rawDelays = reversed
      .filter((r) => purchaseDate(r) && reversalDate(r))
      .map((r) => (Date.parse(reversalDate(r)!) - Date.parse(purchaseDate(r)!)) / 86400000);
    const delays = rawDelays.filter((d) => d >= 0).sort((a, b) => a - b);
    const bounds = [0, 7, 15, 31, 61, 91, Number.POSITIVE_INFINITY];
    const labels = ['0–6 dias', '7–14 dias', '15–30 dias', '31–60 dias', '61–90 dias', '91+ dias'];
    return {
      mean_days: delays.length ? delays.reduce((s, v) => s + v, 0) / delays.length : null,
      median_days: delays.length
        ? (delays[Math.floor((delays.length - 1) / 2)]! + delays[Math.floor(delays.length / 2)]!) /
          2
        : null,
      missing_paid_at: reversed.filter((r) => !purchaseDate(r)).length,
      missing_reversal_at: reversed.filter((r) => !reversalDate(r)).length,
      negative_delay_orders: rawDelays.filter((d) => d < 0).length,
      sample_count: delays.length,
      buckets: labels.map((label, i) => ({
        label,
        count: delays.filter((d) => d >= bounds[i]! && d < bounds[i + 1]!).length,
      })),
    };
  };
  return {
    totals,
    origin_totals: summarizeRefundOrigins(rows, from, to),
    undated_refunds: summarizeUndatedRefunds(rows),
    month_origin: buildRefundMonthOrigin(rows, from, to),
    trend,
    daily: trend,
    comparison: {
      previous_from: previousFrom,
      previous_to: previousTo,
      previous,
      amount_change_pct:
        previous.brl_minor > 0 && !totals.missing_brl_orders && !previous.missing_brl_orders
          ? ((totals.brl_minor - previous.brl_minor) / previous.brl_minor) * 100
          : null,
      rate_change_pp:
        totals.rate_pct !== null && previous.rate_pct !== null
          ? totals.rate_pct - previous.rate_pct
          : null,
    },
    rankings: {
      offers: ranking('offer_id'),
      gateways: ranking('provider'),
      products: ranking('product_name'),
    },
    cohorts,
    delay: delaySummary(true),
    effective_delay: delaySummary(),
    observed_delay: delaySummary(true),
    moving_average_window: 7,
  };
}
