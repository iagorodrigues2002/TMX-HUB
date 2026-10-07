import { describe, expect, it } from 'vitest';
import { collectNetworkIdentifiers } from '../src/lib/network-detection.js';
import { buildTrackerScript } from '../src/services/tracker-script.js';
import { buildGoogleClickConversion } from '../src/workers/google-ads.worker.js';

describe('network tracker capture', () => {
  it('collects every supported click id and browser cookie without changing field names', () => {
    expect(
      collectNetworkIdentifiers(
        {
          fbclid: 'meta-click',
          _fbp: 'fb.1.browser',
          gclid: 'google-click',
          wbraid: 'google-ios',
          gbraid: 'google-ios-alt',
          ttclid: 'tiktok-click',
          _ttp: 'tiktok-browser',
          twclid: 'twitter-click',
        },
        1_785_290_400_000,
      ),
    ).toEqual({
      fbc: 'fb.1.1785290400000.meta-click',
      fbp: 'fb.1.browser',
      gclid: 'google-click',
      wbraid: 'google-ios',
      gbraid: 'google-ios-alt',
      ttclid: 'tiktok-click',
      ttp: 'tiktok-browser',
      twclid: 'twitter-click',
    });
  });

  it('captures TikTok/X fields and their first-party cookies in the browser tracker', () => {
    const script = buildTrackerScript('public-key-123456');
    expect(() => new Function(script)).not.toThrow();
    expect(script).toContain('twclid');
    expect(script).toContain("['_fbp','_fbc','_ttp']");
    expect(script).toContain('ttp');
  });

  it('builds the Google click conversion with all supported Google identifiers only', () => {
    expect(
      buildGoogleClickConversion({
        gclid: 'google-click',
        wbraid: 'google-ios',
        gbraid: 'google-ios-alt',
        fbclid: 'must-not-leak',
      }),
    ).toEqual({
      gclid: 'google-click',
      wbraid: 'google-ios',
      gbraid: 'google-ios-alt',
    });
  });
});
