import { describe, expect, it } from 'vitest';
import { type ReserveBucket, reserveProjection } from '../src/services/reserve-projection.js';

const row = (release_date: string | null, amount = '690', reversed = '0'): ReserveBucket => ({
  purchase_date: '2026-07-30',
  release_date,
  sales: 1,
  reserve_brl_minor: amount,
  reversed_reserve_brl_minor: reversed,
  missing_values: 0,
});

describe('reserve maturity projection', () => {
  it('separates today from the next 7 and 30 days and includes day 90', () => {
    const result = reserveProjection(
      [
        row('2026-10-27'),
        row('2026-10-28'),
        row('2026-10-29'),
        row('2026-11-04'),
        row('2026-11-05'),
        row('2026-11-27'),
        row('2027-01-26'),
        row('2027-01-27'),
      ],
      '2026-10-28',
    );
    expect(result.days).toHaveLength(91);
    expect(result.today.reserve_brl_minor).toBe(690);
    expect(result.next_7_brl_minor).toBe(1380);
    expect(result.next_30_brl_minor).toBe(2760);
    expect(result.pending_after_today_brl_minor).toBe(3450);
    expect(result.days.at(-1)?.date).toBe('2027-01-26');
  });

  it('keeps reversed reserve separate, aggregates orders, and flags missing dates', () => {
    const result = reserveProjection(
      [
        row('2026-10-28', '690', '690'),
        row('2026-10-28'),
        row(null),
        { ...row('2026-10-29', '0'), missing_values: 1 },
      ],
      '2026-10-28',
    );
    expect(result.today.sales).toBe(2);
    expect(result.today.reserve_brl_minor).toBe(1380);
    expect(result.today.reversed_reserve_brl_minor).toBe(690);
    expect(result.missing_dates).toBe(1);
    expect(result.days[1]?.missing_values).toBe(1);
  });

  it('rejects invalid dates and unsafe monetary values', () => {
    expect(() => reserveProjection([], '2026-02-30')).toThrow('invalid_projection_date');
    expect(() => reserveProjection([row('2026-10-28', '1', '2')], '2026-10-28')).toThrow();
    expect(() =>
      reserveProjection([row('2026-10-28', '9007199254740992')], '2026-10-28'),
    ).toThrow();
  });
});
