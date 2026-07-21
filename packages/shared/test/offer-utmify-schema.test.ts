import { describe, expect, it } from 'vitest';
import { CreateOfferRequestSchema, UpdateOfferRequestSchema } from '../src/schemas.js';

describe('Offer UTMify connection schema', () => {
  it('accepts a complete read-only UTMify connection', () => {
    expect(
      CreateOfferRequestSchema.safeParse({
        name: 'Oferta BR',
        company_name: 'Empresa 1',
        dashboard_id: 'dashboard-123',
        utmify_login: 'operator@example.com',
        utmify_password: 'secret',
      }).success,
    ).toBe(true);
  });

  it('rejects partial credentials', () => {
    expect(
      CreateOfferRequestSchema.safeParse({ name: 'Oferta BR', dashboard_id: 'dashboard-123' })
        .success,
    ).toBe(false);
    expect(
      UpdateOfferRequestSchema.safeParse({ utmify_login: 'operator@example.com' }).success,
    ).toBe(false);
  });

  it('keeps legacy offers without a UTMify connection valid', () => {
    expect(CreateOfferRequestSchema.safeParse({ name: 'Oferta manual' }).success).toBe(true);
  });
});
