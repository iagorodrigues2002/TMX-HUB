import { z } from 'zod';
export const compensationMonthSchema = z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/);
export const compensationSchema = z
  .object({
    fixed_minor: z.number().int().min(0).max(100000000),
    enabled: z.boolean(),
    model: z.enum(['upsell', 'manual', 'profit']),
    unit_minor: z.number().int().min(0).max(1000000),
    manual_minor: z.number().int().min(0).max(100000000),
    profit_minor: z.number().int().min(-100000000).max(100000000).nullable(),
    percent_basis_points: z.number().int().min(0).max(10000),
  })
  .strict();
export const defaultCompensation = {
  fixed_minor: 0,
  enabled: false,
  model: 'manual' as const,
  unit_minor: 1000,
  manual_minor: 0,
  profit_minor: null,
  percent_basis_points: 0,
};
export function compensationTotal(settings: z.infer<typeof compensationSchema>, upsells: number) {
  const variable = !settings.enabled
    ? 0
    : settings.model === 'upsell'
      ? upsells * settings.unit_minor
      : settings.model === 'manual'
        ? settings.manual_minor
        : settings.profit_minor === null
          ? null
          : Math.round(
              (Math.max(0, settings.profit_minor) * settings.percent_basis_points) / 10000,
            );
  return {
    variable_minor: variable,
    total_minor: variable === null ? null : settings.fixed_minor + variable,
  };
}
