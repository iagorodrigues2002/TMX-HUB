export type FinanceDay = {
  day: string;
  currency: string | null;
  incoming: string;
  outgoing: string;
  fixed?: string;
  variable?: string;
  withdrawals?: string;
  transactions: number;
  excluded: number;
};

export function financeMonth(days: FinanceDay[], month: string, currency: string, cutoff = 31) {
  const rows = days.filter(
    (d) => d.day.startsWith(month) && d.currency === currency && Number(d.day.slice(8)) <= cutoff,
  );
  const incoming = rows.reduce((sum, d) => sum + Number(d.incoming), 0);
  const outgoing = rows.reduce((sum, d) => sum + Number(d.outgoing), 0);
  return {
    incoming,
    outgoing,
    net: incoming - outgoing,
    fixed: rows.reduce((s, d) => s + Number(d.fixed ?? 0), 0),
    variable: rows.reduce((s, d) => s + Number(d.variable ?? 0), 0),
    withdrawals: rows.reduce((s, d) => s + Number(d.withdrawals ?? 0), 0),
    transactions: rows.reduce((sum, d) => sum + d.transactions, 0),
  };
}

export type AvailableAccount = {
  provider: string;
  status: string;
  balances: {
    id: string;
    amount: string;
    currency: string;
    label: string;
    stale: boolean;
    at: string;
  }[];
};
export type FinanceRate = { currency: string; rate: string; fetched_at: string };

export function convertFinanceDays(days: FinanceDay[], target: string, rates: FinanceRate[]) {
  const rateMap = new Map(rates.map((r) => [r.currency, Number(r.rate)]));
  rateMap.set('BRL', 1);
  // Display estimate only: USDC uses its USD reference, not an executable exchange quote.
  const reference = (currency: string) => (currency === 'USDC' ? 'USD' : currency);
  const missing = new Set<string>();
  const converted = days.map((day) => {
    if (!day.currency) return day;
    const source = reference(day.currency);
    const destination = reference(target);
    const from = rateMap.get(source);
    const to = rateMap.get(destination);
    const factor = source === destination ? 1 : from && to ? from / to : Number.NaN;
    if (!Number.isFinite(factor) || factor <= 0) {
      missing.add(day.currency);
      return day;
    }
    const amount = (value: string | undefined) => String(Number(value ?? 0) * factor);
    return {
      ...day,
      currency: target,
      incoming: amount(day.incoming),
      outgoing: amount(day.outgoing),
      fixed: amount(day.fixed),
      variable: amount(day.variable),
      withdrawals: amount(day.withdrawals),
    };
  });
  return {
    days: missing.size ? [] : converted,
    missing: [...missing],
    estimatedUsdc: days.some((day) => day.currency === 'USDC'),
  };
}

export function availableFinanceBalance(accounts: AvailableAccount[], rates: FinanceRate[]) {
  const rateMap = new Map(rates.map((r) => [r.currency, Number(r.rate)]));
  rateMap.set('BRL', 1);
  let brl = 0;
  let unavailable = 0;
  let stale = false;
  let count = 0;
  for (const account of accounts) {
    if (account.status === 'disconnected') continue;
    const balances = account.balances.filter((b) =>
      account.provider === 'lootrush' ? b.id === 'available' : b.label === 'Saldo em conta',
    );
    if (!balances.length) unavailable++;
    for (const balance of balances) {
      const rate = rateMap.get(balance.currency);
      const amount = Number(balance.amount);
      if (
        !Number.isFinite(amount) ||
        (amount !== 0 && (!rate || !Number.isFinite(rate) || rate <= 0))
      ) {
        unavailable++;
        continue;
      }
      brl += amount * (rate ?? 1);
      stale ||= balance.stale || account.status === 'error';
      count++;
    }
  }
  const usdRate = rateMap.get('USD');
  return {
    brl,
    usd: usdRate && usdRate > 0 && Number.isFinite(usdRate) ? brl / usdRate : null,
    unavailable,
    stale,
    count,
  };
}

export function financeGrowth(current: number, previous: number) {
  return previous > 0 ? ((current - previous) / previous) * 100 : null;
}

export function previousFinanceMonth(month: string) {
  const [year, number] = month.split('-').map(Number);
  return new Date(Date.UTC(year!, number! - 2, 1)).toISOString().slice(0, 7);
}
