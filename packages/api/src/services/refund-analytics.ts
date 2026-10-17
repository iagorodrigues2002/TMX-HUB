/** Financial analytics: one reversal per order, dated by its first lifecycle event. */
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
  if (interval === 'month') return day.slice(0, 7) + '-01';
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
function finish(t: ReturnType<typeof emptyRefundTotals>) {
  t.impact_brl_minor = t.brl_minor + t.fee_brl_minor;
  t.rate_pct =
    t.gross_brl_minor > 0 && !t.missing_brl_orders ? (t.brl_minor / t.gross_brl_minor) * 100 : null;
  t.impact_pct =
    t.gross_brl_minor > 0 && !t.missing_brl_orders && !t.missing_fee_orders
      ? (t.impact_brl_minor / t.gross_brl_minor) * 100
      : null;
  return t;
}
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
export function buildRefundAnalytics(
  rows: RefundOrder[],
  from: string,
  to: string,
  interval: 'day' | 'week' | 'month',
  today: string,
) {
  const span = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
  const previousTo = shiftDay(from, -1),
    previousFrom = shiftDay(from, -span);
  const totals = summarizeRefunds(rows, from, to),
    previous = summarizeRefunds(rows, previousFrom, previousTo);
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
  const purchaseDate = (r: RefundOrder) => r.delay_paid_at === undefined ? r.paid_at : r.delay_paid_at;
  const reversalDate = (r: RefundOrder) => observed ? r.observed_reversal_at : r.delay_reversal_at === undefined ? r.reversal_at : r.delay_reversal_at;
  const rawDelays = reversed
    .filter((r) => purchaseDate(r) && reversalDate(r))
    .map((r) => (Date.parse(reversalDate(r)!) - Date.parse(purchaseDate(r)!)) / 86400000);
  const delays = rawDelays.filter((d) => d >= 0).sort((a, b) => a - b);
  const bounds = [0, 7, 15, 31, 61, 91, Infinity];
  const labels = ['0–6 dias', '7–14 dias', '15–30 dias', '31–60 dias', '61–90 dias', '91+ dias'];
  return {
    mean_days: delays.length ? delays.reduce((s, v) => s + v, 0) / delays.length : null,
    median_days: delays.length ? (delays[Math.floor((delays.length - 1) / 2)]! + delays[Math.floor(delays.length / 2)]!) / 2 : null,
    missing_paid_at: reversed.filter((r) => !purchaseDate(r)).length,
    missing_reversal_at: reversed.filter((r) => !reversalDate(r)).length,
    negative_delay_orders: rawDelays.filter((d) => d < 0).length,
    sample_count: delays.length,
    buckets: labels.map((label, i) => ({ label, count: delays.filter((d) => d >= bounds[i]! && d < bounds[i + 1]!).length })),
  };
  };
  return {
    totals,
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
