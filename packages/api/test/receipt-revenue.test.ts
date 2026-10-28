import { describe, expect, it } from 'vitest';
import { type RevenueReceipt, hourlyReceiptRevenue } from '../src/services/receipt-revenue.js';

const from = new Date('2026-10-27T03:00:00Z');
const to = new Date('2026-10-28T03:00:00Z');
const receipt = (id: string, at: string, status = 'approved'): RevenueReceipt => ({
  order_id: id,
  external_id: id,
  provider: 'vendepay',
  received_at: at,
  amount_brl_minor: '2900',
  payload: { transaction_id: id, status },
});

describe('receipt revenue', () => {
  it('partitions deduplicated revenue by real kind and keeps unknown sales separate', () => {
    const front = { ...receipt('f', '2026-10-27T04:00:00Z'), order_kind: 'front' };
    const result = hourlyReceiptRevenue(
      [
        front,
        front,
        { ...receipt('u', '2026-10-27T04:00:00Z'), order_kind: 'upsell' },
        receipt('unknown', '2026-10-27T04:00:00Z'),
        {
          ...receipt('missing', '2026-10-27T04:00:00Z'),
          order_kind: 'upsell',
          amount_brl_minor: null,
        },
      ],
      from,
      to,
    );
    expect(result.hours[1]?.sales).toBe(3);
    for (const kind of ['front', 'upsell', 'unknown'] as const) {
      expect(result.by_kind[kind].hours[1]?.revenue_brl_minor).toBe(2900);
    }
    expect(result.by_kind.upsell.missing_currency).toBe(1);
    expect(result.by_kind.front.missing_currency).toBe(0);
  });
  it('uses first approval, not pending or replay, and aggregates exact cents in Sao Paulo', () => {
    const result = hourlyReceiptRevenue(
      [
        receipt('front', '2026-10-27T06:00:00Z'),
        receipt('front', '2026-10-27T04:10:00Z'),
        receipt('front', '2026-10-27T03:30:00Z', 'pending'),
        receipt('upsell', '2026-10-27T04:50:00Z'),
        receipt('front', '2026-10-27T08:00:00Z', 'refunded'),
      ],
      from,
      to,
    );
    expect(result.hours[1]).toEqual({ hour: 1, sales: 2, revenue_brl_minor: 5800 });
    expect(result.hours.reduce((sum, row) => sum + row.sales, 0)).toBe(2);
  });
  it('does not count an old purchase replayed today; excludes the end boundary', () => {
    const result = hourlyReceiptRevenue(
      [
        receipt('old', '2026-10-27T02:59:59Z'),
        receipt('old', '2026-10-27T07:00:00Z'),
        receipt('next', '2026-10-28T03:00:00Z'),
      ],
      from,
      to,
    );
    expect(result.hours.every((row) => row.sales === 0)).toBe(true);
  });
  it('does not merge different internal orders or assume unknown currency is BRL', () => {
    const result = hourlyReceiptRevenue(
      [
        { ...receipt('one', '2026-10-27T03:00:00Z'), provider: 'syzepay' },
        { ...receipt('two', '2026-10-27T03:00:00Z'), provider: 'syzepay', amount_brl_minor: null },
      ],
      from,
      to,
    );
    expect(result.hours[0]?.sales).toBe(1);
    expect(result.missing_currency).toBe(1);
  });
  it('rejects an approval belonging to another external order', () => {
    const row = { ...receipt('one', '2026-10-27T04:00:00Z'), external_id: 'other' };
    expect(hourlyReceiptRevenue([row], from, to).hours.every((item) => item.sales === 0)).toBe(
      true,
    );
  });
});
