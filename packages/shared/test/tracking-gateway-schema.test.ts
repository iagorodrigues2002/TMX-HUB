import { describe, expect, it } from 'vitest';
import {
  ExplodelyGatewaySettingsSchema,
  TikTokDestinationSchema,
  TrackingGatewayProviderSchema,
} from '../src/schemas.js';

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

  it('accepts an optional nullable TikTok Test Event Code', () => {
    const destination = {
      name: 'TikTok principal',
      pixel_code: 'C123ABC',
      access_token: 'token-with-at-least-16-characters',
      enabled: true,
    };

    expect(TikTokDestinationSchema.parse(destination)).toMatchObject({
      ...destination,
      test_event_code: null,
    });
    expect(
      TikTokDestinationSchema.parse({ ...destination, test_event_code: ' TMX_TEST_123 ' }),
    ).toMatchObject({ test_event_code: 'TMX_TEST_123' });
  });
});
