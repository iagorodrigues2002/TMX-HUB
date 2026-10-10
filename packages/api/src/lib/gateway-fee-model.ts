import { z } from 'zod';
export const gatewayFeesSchema = z
  .object({
    fee_pct: z.number().finite().min(0).max(100),
    fixed_fee_minor: z.number().int().min(0).max(1_000_000_000),
    fee_currency: z.string().regex(/^[A-Z]{3}$/),
    penalty_currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .optional(),
    reserve_pct: z.number().finite().min(0).max(100),
    chargeback_fee_minor: z.number().int().min(0).max(1_000_000_000),
    refund_fee_minor: z.number().int().min(0).max(1_000_000_000),
  })
  .strict();
