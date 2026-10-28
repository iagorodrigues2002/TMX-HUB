export interface SaleNoticeOrder {
  id: string;
  status: string;
  occurred_at: string;
}

// Keep the visible batch stable; coalesce arrivals into a single waiting popup.
export function enqueueSaleNotices<T extends { id: string }>(queue: T[][], incoming: T[]): T[][] {
  const ids = new Set(queue.flat().map((notice) => notice.id));
  const fresh = incoming.filter((notice) => {
    if (ids.has(notice.id)) return false;
    ids.add(notice.id);
    return true;
  });
  if (!fresh.length) return queue;
  const active = queue[0];
  if (!active) return [fresh];
  return [active, [...queue.slice(1).flat(), ...fresh]];
}

export function saleNoticeTotals(
  notices: { amount_minor?: string | number | null; currency?: string | null }[],
) {
  const totals = new Map<string, number>();
  let unknown = 0;
  for (const notice of notices) {
    const amount = Number(notice.amount_minor);
    if (
      notice.amount_minor == null ||
      !notice.currency ||
      !Number.isSafeInteger(amount) ||
      amount < 0
    ) {
      unknown++;
      continue;
    }
    totals.set(notice.currency, (totals.get(notice.currency) ?? 0) + amount);
  }
  return { totals: [...totals], unknown };
}

export function takeNewApproved<T extends SaleNoticeOrder>(
  orders: T[],
  seen: Set<string>,
  startedAt: number,
): T[] {
  return orders.filter((order) => {
    if (order.status !== 'paid' || seen.has(order.id)) return false;
    seen.add(order.id);
    const time = Date.parse(order.occurred_at);
    return Number.isFinite(time) && time > startedAt && time <= Date.now();
  });
}
