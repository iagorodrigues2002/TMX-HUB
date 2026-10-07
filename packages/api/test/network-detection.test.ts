import { describe, expect, it, vi } from 'vitest';
import {
  buildFbcFromFbclid,
  canonicalClickId,
  detectNetwork,
} from '../src/lib/network-detection.js';

describe('network detection', () => {
  it.each([
    [{ fbclid: 'meta-click' }, 'meta'],
    [{ gclid: 'google-click' }, 'google'],
    [{ wbraid: 'google-ios-click' }, 'google'],
    [{ gbraid: 'google-ios-alt-click' }, 'google'],
    [{ ttclid: 'tiktok-click' }, 'tiktok'],
    [{ twclid: 'twitter-click' }, 'twitter'],
    [{ utm_source: 'instagram' }, 'meta'],
    [{ utm_source: 'YouTube' }, 'google'],
    [{ utm_source: 'TikTok Ads' }, 'tiktok'],
    [{ utm_source: 'x' }, 'twitter'],
    [{ utm_source: 'newsletter' }, 'other'],
  ] as const)('detects %j as %s', (params, expected) => {
    expect(detectNetwork(params)).toBe(expected);
  });

  it('prioritizes a canonical click id over a conflicting utm_source', () => {
    expect(detectNetwork({ gclid: 'google-click', utm_source: 'facebook' })).toBe('google');
  });

  it('uses utm_source to disambiguate visitors carrying click ids from multiple networks', () => {
    expect(
      detectNetwork({ fbc: 'fb.1.1.old-click', gclid: 'new-click', utm_source: 'youtube' }),
    ).toBe('google');
  });

  it('builds the Meta CAPI fbc and returns only the identifiers for the selected network', () => {
    expect(buildFbcFromFbclid('meta-click', 1_785_290_400_000)).toBe(
      'fb.1.1785290400000.meta-click',
    );
    expect(
      canonicalClickId('meta', {
        fbclid: 'meta-click',
        _fbclid_ts: '1785290400000',
        gclid: 'must-not-leak',
      }),
    ).toEqual({ fbc: 'fb.1.1785290400000.meta-click' });
    expect(
      canonicalClickId('google', {
        gclid: 'google-click',
        wbraid: 'ios-web-to-app',
        gbraid: 'ios-alt',
        ttclid: 'must-not-leak',
      }),
    ).toEqual({ gclid: 'google-click', wbraid: 'ios-web-to-app', gbraid: 'ios-alt' });
    expect(canonicalClickId('tiktok', { ttclid: 'tiktok-click', twclid: 'x-click' })).toEqual({
      ttclid: 'tiktok-click',
    });
    expect(canonicalClickId('twitter', { twclid: 'x-click', fbclid: 'meta-click' })).toEqual({
      twclid: 'x-click',
    });
  });

  it('uses the capture time when Meta supplied no click timestamp', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-29T10:00:00.000Z'));
    expect(canonicalClickId('meta', { fbclid: 'meta-click' })).toEqual({
      fbc: `fb.1.${Date.now()}.meta-click`,
    });
    vi.useRealTimers();
  });
});
