import { describe, expect, it } from 'vitest';
import { normalizeAdAttribution } from '../src/lib/ad-attribution.js';

describe('explicit Meta ad identifiers', () => {
  it('extracts IDs from UTMify name|id fields, never from an ad label', () => {
    expect(
      normalizeAdAttribution({
        utm_source: 'fb',
        utm_campaign: 'Campaign|123456789012345',
        utm_medium: 'Adset|123456789012346',
        utm_content: 'AD06|123456789012347',
      }),
    ).toMatchObject({
      campaign_id: '123456789012345',
      adset_id: '123456789012346',
      ad_id: '123456789012347',
    });
    expect(normalizeAdAttribution({ utm_source: 'fb', utm_content: 'ad06' })).not.toHaveProperty(
      'ad_id',
    );
  });
  it('preserves explicit IDs and does not interpret non-Meta numeric UTMs', () => {
    expect(
      normalizeAdAttribution({
        utm_source: 'fb',
        ad_id: '123456789012349',
        utm_content: 'AD|123456789012347',
      }).ad_id,
    ).toBe('123456789012349');
    expect(
      normalizeAdAttribution({ utm_source: 'google', utm_content: '123456789012345' }),
    ).not.toHaveProperty('ad_id');
  });
  it('captures common explicit aliases and discards unresolved macros', () => {
    expect(
      normalizeAdAttribution({
        utm_source: 'facebook',
        adId: '123456789012345',
        adsetId: '123456789012346',
        campaignId: '123456789012347',
        fbclid: '{{fbclid}}',
      }),
    ).toMatchObject({
      ad_id: '123456789012345',
      adset_id: '123456789012346',
      campaign_id: '123456789012347',
    });
    expect(normalizeAdAttribution({ fbclid: '{{fbclid}}' })).not.toHaveProperty('fbclid');
  });
});
