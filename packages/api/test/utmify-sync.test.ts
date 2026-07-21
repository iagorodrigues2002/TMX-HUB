import { describe, expect, it } from 'vitest';
import { toSnapshot } from '../src/services/utmify-sync.js';

describe('UTMify ad-level snapshot', () => {
  it('converts cents and aggregates duplicate ad names', () => {
    const snapshot = toSnapshot('offer-1', '2026-07-21', [
      {
        name: 'AD1-H1-L3_blindado',
        spend: 1250,
        revenue: 5000,
        approvedOrdersCount: 2,
        initiateCheckout: 4,
        impressions: 100,
        inlineLinkClicks: 10,
        videoViews3Seconds: 30,
      },
      {
        name: 'AD1-H1-L3_blindado',
        spend: 250,
        revenue: -1000,
        approvedOrdersCount: 1,
        initiateCheckout: 2,
        impressions: 50,
        inlineLinkClicks: 5,
        videoViews3Seconds: 15,
      },
    ]);

    expect(snapshot.spend).toBe(15);
    expect(snapshot.revenue).toBe(40);
    expect(snapshot.sales).toBe(3);
    expect(snapshot.ads).toHaveLength(1);
    expect(snapshot.ads?.[0]).toMatchObject({
      name: 'AD1-H1-L3_blindado',
      spend: 15,
      revenue: 40,
      sales: 3,
      ic: 6,
      ctr: 0.1,
      hookRate: 0.3,
    });
  });

  it('clamps negative ad revenue to zero without changing spend', () => {
    const snapshot = toSnapshot('offer-1', '2026-07-21', [
      { name: 'AD reembolso', spend: 990, revenue: -2500 },
    ]);
    expect(snapshot.spend).toBe(9.9);
    expect(snapshot.revenue).toBe(0);
    expect(snapshot.ads?.[0]?.revenue).toBe(0);
  });
});
