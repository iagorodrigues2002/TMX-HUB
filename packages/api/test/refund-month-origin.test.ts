import { describe, expect, it } from 'vitest';
import { type RefundOrder, buildRefundAnalytics } from '../src/services/refund-analytics.js';
import { recoverRefundDateEvidence } from '../src/services/refund-date-evidence.js';

const order = (patch: Partial<RefundOrder> = {}): RefundOrder => ({
  id: 'refund',
  offer_id: 'offer',
  offer_name: 'Oferta',
  provider: 'vendepay',
  connection_name: 'Mainex',
  product_name: 'Front',
  paid_at: '2026-09-15T12:00:00Z',
  reversal_at: '2026-10-05T12:00:00Z',
  amount_brl_minor: 10000,
  penalty_brl_minor: 2700,
  ...patch,
});

const analyze = (rows: RefundOrder[], from = '2026-10-01', to = '2026-10-31') =>
  buildRefundAnalytics(rows, from, to, 'day', '2026-11-03').month_origin;

describe('refund impact by purchase month', () => {
  it('measures last-month purchases against refunds and gross in the receipt month', () => {
    const result = analyze([
      order(),
      order({
        id: 'sale',
        paid_at: '2026-10-10T12:00:00Z',
        reversal_at: null,
        amount_brl_minor: 40000,
      }),
    ]);

    expect(result).toMatchObject({
      basis: 'first_confirmed_receipt',
      timezone: 'America/Sao_Paulo',
    });
    expect(result.months).toHaveLength(1);
    expect(result.months[0]).toMatchObject({
      month: '2026-10',
      from: '2026-10-01',
      to: '2026-10-31',
      partial_month: false,
      gross_brl_minor: 40000,
      total: { count: 1, brl_minor: 10000, fee_brl_minor: 2700, impact_brl_minor: 12700 },
    });
    expect(result.months[0]!.groups.find((group) => group.key === 'previous_month')).toMatchObject({
      purchase_month: '2026-09',
      count: 1,
      brl_minor: 10000,
      fee_brl_minor: 2700,
      impact_brl_minor: 12700,
      share_pct: 100,
      refund_pct: 25,
      impact_pct: 31.75,
    });
  });

  it('reconciles every reversal to its purchase origin without guessing absent or inconsistent dates', () => {
    const rows = [
      order({ id: 'same', paid_at: '2026-10-01T12:00:00Z', amount_brl_minor: 1000 }),
      order({
        id: 'previous',
        paid_at: '2026-08-01T12:00:00Z',
        delay_paid_at: '2026-09-01T12:00:00Z',
        amount_brl_minor: 2000,
      }),
      order({ id: 'old', paid_at: '2026-08-01T12:00:00Z', amount_brl_minor: 3000 }),
      order({ id: 'missing', delay_paid_at: null, amount_brl_minor: 4000 }),
      order({ id: 'invalid', delay_paid_at: 'not-a-date', amount_brl_minor: 5000 }),
      order({ id: 'future', paid_at: '2026-10-06T12:00:00Z', amount_brl_minor: 6000 }),
      order({
        id: 'no-receipt',
        reversal_at: null,
        reversal_received_missing: true,
        amount_brl_minor: 7000,
      }),
    ];
    const month = analyze(rows).months[0]!;
    expect(month.groups.map(({ key, count, brl_minor }) => ({ key, count, brl_minor }))).toEqual([
      { key: 'same_month', count: 1, brl_minor: 1000 },
      { key: 'previous_month', count: 1, brl_minor: 2000 },
      { key: 'older', count: 1, brl_minor: 3000 },
      { key: 'unknown', count: 3, brl_minor: 15000 },
    ]);
    for (const field of ['count', 'brl_minor', 'fee_brl_minor', 'impact_brl_minor'] as const)
      expect(month.groups.reduce((sum, group) => sum + group[field], 0)).toBe(month.total[field]);
    expect(month.groups.reduce((sum, group) => sum + group.share_pct!, 0)).toBeCloseTo(100);
  });

  it('uses São Paulo calendar months at UTC midnight, including the year boundary', () => {
    const result = analyze(
      [
        order({
          id: 'december',
          paid_at: '2026-12-01T03:00:00Z',
          reversal_at: '2027-01-01T02:59:59Z',
        }),
        order({
          id: 'january',
          paid_at: '2027-01-01T02:59:59Z',
          reversal_at: '2027-01-01T03:00:00Z',
        }),
      ],
      '2026-12-31',
      '2027-01-01',
    );
    expect(result.months.map((month) => [month.month, month.total.count])).toEqual([
      ['2026-12', 1],
      ['2027-01', 1],
    ]);
    expect(result.months[0]!.groups.find((group) => group.key === 'same_month')!.count).toBe(1);
    expect(result.months[1]!.groups.find((group) => group.key === 'previous_month')).toMatchObject({
      purchase_month: '2026-12',
      count: 1,
    });
  });

  it('uses the exact selected slice for partial-month refund and revenue denominators', () => {
    const result = analyze(
      [
        order({ id: 'excluded-refund', reversal_at: '2026-10-14T12:00:00Z' }),
        order({ id: 'included-refund', reversal_at: '2026-10-15T12:00:00Z' }),
        order({
          id: 'excluded-sale',
          paid_at: '2026-10-14T12:00:00Z',
          reversal_at: null,
          amount_brl_minor: 90000,
        }),
        order({
          id: 'included-sale',
          paid_at: '2026-10-15T12:00:00Z',
          reversal_at: null,
          amount_brl_minor: 20000,
        }),
        order({
          id: 'nov-refund',
          paid_at: '2026-10-20T12:00:00Z',
          reversal_at: '2026-11-02T12:00:00Z',
          amount_brl_minor: 10000,
        }),
      ],
      '2026-10-15',
      '2026-11-03',
    );
    expect(result.months[0]).toMatchObject({
      from: '2026-10-15',
      to: '2026-10-31',
      partial_month: true,
      gross_brl_minor: 30000,
      total: { count: 1 },
    });
    expect(result.months[1]).toMatchObject({
      from: '2026-11-01',
      to: '2026-11-03',
      partial_month: true,
      gross_brl_minor: 0,
      total: { count: 1 },
    });
    expect(result.months[1]!.groups.find((group) => group.key === 'previous_month')).toMatchObject({
      share_pct: 100,
      refund_pct: null,
      impact_pct: null,
    });
  });

  it('separates missing refund, fee and revenue amounts and never fabricates percentages', () => {
    const missingRefund = analyze([order({ amount_brl_minor: null })]).months[0]!;
    expect(missingRefund.groups.every((group) => group.share_pct === null)).toBe(true);
    expect(missingRefund.total.missing_brl_orders).toBe(1);
    const missingGross = analyze([
      order(),
      order({
        id: 'sale',
        paid_at: '2026-10-10T12:00:00Z',
        reversal_at: null,
        amount_brl_minor: null,
      }),
    ]).months[0]!;
    expect(missingGross.missing_gross_orders).toBe(1);
    expect(missingGross.groups.find((group) => group.key === 'previous_month')).toMatchObject({
      share_pct: 100,
      refund_pct: null,
      impact_pct: null,
    });
    const missingFee = analyze([
      order({ penalty_brl_minor: null }),
      order({
        id: 'sale',
        paid_at: '2026-10-10T12:00:00Z',
        reversal_at: null,
        amount_brl_minor: 20000,
      }),
    ]).months[0]!;
    expect(missingFee.groups.find((group) => group.key === 'previous_month')).toMatchObject({
      share_pct: 100,
      refund_pct: 50,
      impact_pct: null,
      missing_fee_orders: 1,
    });
  });

  it('keeps empty months explicit without adding percentages from different months', () => {
    const result = analyze([], '2026-09-01', '2026-11-03');
    expect(result.months.map(({ month }) => month)).toEqual(['2026-09', '2026-10', '2026-11']);
    expect(
      result.months.every(
        (month) =>
          month.total.count === 0 &&
          month.groups.every(
            (group) =>
              group.share_pct === null && group.refund_pct === null && group.impact_pct === null,
          ),
      ),
    ).toBe(true);
  });

  it('counts refund and chargeback replays only in the first confirmed receipt month', () => {
    const rows = recoverRefundDateEvidence(
      [order({ reversal_at: '2026-09-15T12:00:00Z', external_id: 'transaction' })],
      [
        {
          order_id: 'refund',
          external_id: 'transaction',
          received_at: '2026-09-15T12:00:00Z',
          payload: {
            checkoutId: 'transaction',
            event: 'compra.aprovada',
            status: 2,
            createdAt: '2026-09-15T12:00:00Z',
          },
        },
        {
          order_id: 'refund',
          external_id: 'transaction',
          received_at: '2026-11-01T02:59:59Z',
          payload: {
            checkoutId: 'transaction',
            event: 'reembolso',
            createdAt: '2026-09-15T12:00:00Z',
          },
        },
        {
          order_id: 'refund',
          external_id: 'transaction',
          received_at: '2026-11-03T12:00:00Z',
          payload: {
            checkoutId: 'transaction',
            event: 'chargeback',
            createdAt: '2026-09-15T12:00:00Z',
          },
        },
      ],
    );
    const result = analyze(rows, '2026-09-01', '2026-11-03');
    expect(result.months.map((month) => [month.month, month.total.count])).toEqual([
      ['2026-09', 0],
      ['2026-10', 1],
      ['2026-11', 0],
    ]);
    expect(result.months[1]!.groups.find((group) => group.key === 'previous_month')).toMatchObject({
      count: 1,
      brl_minor: 10000,
      purchase_month: '2026-09',
    });
  });
});
