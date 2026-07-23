import { describe, expect, it } from 'vitest';
import {
  buildDays,
  canonicalAdIdentity,
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

  it('groups copied ads with their original visible name', () => {
    const snapshot = toSnapshot('offer-sdm', '2026-07-23', [
      {
        name: 'ad3-l14 — Cópia',
        spend: 12345,
        revenue: 20000,
        approvedOrdersCount: 1,
      },
      {
        name: 'ad3-l14',
        spend: 8765,
        revenue: 15000,
        approvedOrdersCount: 2,
      },
    ]);

    expect(snapshot.ads).toHaveLength(1);
    expect(snapshot.ads?.[0]).toMatchObject({
      name: 'ad3-l14',
      revenue: 350,
      sales: 3,
    });
    expect(snapshot.ads?.[0]?.spend).toBeCloseTo(211.1);
    expect(snapshot.spend).toBeCloseTo(211.1);
  });

  it('groups p+g cloaked ads with their base ad', () => {
    const snapshot = toSnapshot('offer-sdm', '2026-07-23', [
      {
        name: 'ad3-l14_p+g_cloaked',
        spend: 7000,
        revenue: 12000,
        approvedOrdersCount: 1,
      },
      {
        name: 'ad3-l14',
        spend: 3000,
        revenue: 8000,
        approvedOrdersCount: 1,
      },
    ]);

    expect(snapshot.ads).toHaveLength(1);
    expect(snapshot.ads?.[0]).toMatchObject({
      name: 'ad3-l14',
      revenue: 200,
      sales: 2,
    });
    expect(snapshot.spend).toBe(100);
  });

  it('removes only explicit copy suffixes from ad identities', () => {
    expect(canonicalAdIdentity('AD3-L14 (Cópia 2)')).toEqual({
      key: 'ad3-l14',
      name: 'AD3-L14',
    });
    expect(canonicalAdIdentity('Cópia que vende')).toEqual({
      key: 'copia que vende',
      name: 'Cópia que vende',
    });
  });

  it('excludes engagement placeholder ads from every calculated total', () => {
    const snapshot = toSnapshot('offer-sdm', '2026-07-23', [
      {
        name: 'Novo anúncio de Engajamento',
        spend: 10000,
        revenue: 50000,
        approvedOrdersCount: 5,
        initiateCheckout: 12,
      },
      {
        name: 'NOVO ANUNCIO DE ENGAJAMENTO — Cópia',
        spend: 2500,
        revenue: 10000,
        approvedOrdersCount: 1,
        initiateCheckout: 3,
      },
      {
        name: 'ad3-l14',
        spend: 1234,
        revenue: 3000,
        approvedOrdersCount: 1,
        initiateCheckout: 2,
      },
    ]);

    expect(snapshot.ads).toHaveLength(1);
    expect(snapshot.ads?.[0]?.name).toBe('ad3-l14');
    expect(snapshot.spend).toBe(12.34);
    expect(snapshot.revenue).toBe(30);
    expect(snapshot.sales).toBe(1);
    expect(snapshot.ic).toBe(2);
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
