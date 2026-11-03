import { expect, it } from 'vitest';
import {
  compensationSchema,
  compensationTotal,
  defaultCompensation,
} from '../src/services/company-compensation.js';
it('calculates R$10 per credited upsell, fixed plus variable, and supports disabling', () => {
  const settings = {
    ...defaultCompensation,
    fixed_minor: 200000,
    enabled: true,
    model: 'upsell' as const,
  };
  expect(compensationTotal(settings, 38)).toEqual({ variable_minor: 38000, total_minor: 238000 });
  expect(compensationTotal({ ...settings, enabled: false }, 38).total_minor).toBe(200000);
});
it('does not invent profit, clamps negative profit and rounds cents', () => {
  const settings = {
    ...defaultCompensation,
    enabled: true,
    model: 'profit' as const,
    percent_basis_points: 1000,
  };
  expect(compensationTotal(settings, 10).total_minor).toBeNull();
  expect(compensationTotal({ ...settings, profit_minor: -1000 }, 10).variable_minor).toBe(0);
  expect(compensationTotal({ ...settings, profit_minor: 123456 }, 10).variable_minor).toBe(12346);
});
it('supports manual variable and rejects invalid money and percentages', () => {
  expect(
    compensationTotal({ ...defaultCompensation, enabled: true, manual_minor: 999 }, 0).total_minor,
  ).toBe(999);
  expect(compensationSchema.safeParse({ ...defaultCompensation, fixed_minor: -1 }).success).toBe(
    false,
  );
  expect(
    compensationSchema.safeParse({ ...defaultCompensation, percent_basis_points: 10001 }).success,
  ).toBe(false);
});
