import { describe, expect, it } from 'vitest';
import { ExplodelyGatewaySettingsSchema, TrackingGatewayProviderSchema } from '../src/schemas.js';

describe('tracking gateway schemas', () => {
  it('lists Explodely as a universal gateway provider', () => {
    expect(TrackingGatewayProviderSchema.options).toContain('explodely');
  });

  it('applies the Explodely defaults used by the settings form', () => {
    expect(ExplodelyGatewaySettingsSchema.parse({ vendor_id: 'vendor-123' })).toEqual({
      vendor_id: 'vendor-123',
      currency: 'USD',
      amount_unit: 'cents',
      amount_scale: 100,
    });
  });

  it('requires a vendor and restricts currency, unit and divisor', () => {
    expect(ExplodelyGatewaySettingsSchema.safeParse({ vendor_id: '' }).success).toBe(false);
    expect(
      ExplodelyGatewaySettingsSchema.safeParse({
        vendor_id: 'vendor-123',
        currency: 'GBP',
        amount_unit: 'minor',
        amount_scale: 25,
      }).success,
    ).toBe(false);
  });
});
