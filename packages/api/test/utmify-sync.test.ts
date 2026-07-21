import { describe, expect, it } from 'vitest';
import {
  buildDays,
  detectCurrency,
  detectDashboardCurrency,
  saoPauloDayRange,
  toSnapshot,
} from '../src/services/utmify-sync.js';

describe('UTMify ad-level snapshot', () => {
  it('groups equal ad names while summing every UTMify result', () => {
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

  it('detects the dashboard currency in nested UTMify metadata or result fields', () => {
    expect(detectCurrency({ dashboard: { currency: 'usd' }, results: [] })).toBe('USD');
    expect(detectCurrency({ results: [{ name: 'AD1', currencyCode: 'BRL' }] })).toBe('BRL');
    expect(detectCurrency({ results: [{ name: 'AD1' }] })).toBeUndefined();
  });

  it('selects the currency from the exact dashboard returned by UTMify auth', () => {
    const payload = {
      auth: {
        user: {
          dashboards: [
            { id: 'dash-br', name: 'Brasil', currency: 'BRL' },
            { id: 'dash-us', name: 'GEX', currency: 'USD' },
          ],
        },
      },
    };
    expect(detectDashboardCurrency(payload, 'dash-us')).toBe('USD');
    expect(detectDashboardCurrency(payload, 'missing')).toBeUndefined();
  });
});

describe('UTMify reporting day', () => {
  it('queries today from midnight in Sao Paulo and caps the range at now', () => {
    expect(saoPauloDayRange('2026-07-21', new Date('2026-07-21T15:00:00.000Z'))).toEqual({
      from: '2026-07-21T03:00:00.000Z',
      to: '2026-07-21T15:00:00.000Z',
    });
  });

  it('closes past days at the following Sao Paulo midnight', () => {
    expect(saoPauloDayRange('2026-07-20', new Date('2026-07-21T15:00:00.000Z'))).toEqual({
      from: '2026-07-20T03:00:00.000Z',
      to: '2026-07-21T03:00:00.000Z',
    });
  });

  it('uses the Sao Paulo calendar date near UTC midnight', () => {
    expect(buildDays(2, new Date('2026-07-22T01:30:00.000Z'))).toEqual([
      '2026-07-20',
      '2026-07-21',
    ]);
  });
});
