import { describe, expect, it } from 'vitest';
import { buildIntradaySummary } from '../src/services/intraday-store.js';

describe('intraday two-hour windows', () => {
  it('uses cumulative checkpoint deltas for the window metrics', () => {
    const summary = buildIntradaySummary(
      '2026-07-21',
      [
        { capturedAt: '2026-07-21T12:59:00.000Z', spend: 800, sales: 0, revenue: 0, ic: 20 },
        { capturedAt: '2026-07-21T13:02:00.000Z', spend: 820, sales: 1, revenue: 100, ic: 22 },
        { capturedAt: '2026-07-21T14:59:00.000Z', spend: 1000, sales: 4, revenue: 900, ic: 30 },
      ],
      new Date('2026-07-21T15:00:00.000Z'),
    );

    const window = summary.windows[5]; // 10h–12h in America/Sao_Paulo
    expect(window.available).toBe(true);
    expect(window.metrics).toMatchObject({ spend: 200, sales: 4, revenue: 900, ic: 10, cpa: 50 });
    expect(summary.overall).toMatchObject({ spend: 1000, sales: 4, revenue: 900, ic: 30 });
  });

  it('marks the first observed window as partial instead of inventing a baseline', () => {
    const summary = buildIntradaySummary(
      '2026-07-21',
      [{ capturedAt: '2026-07-21T15:00:00.000Z', spend: 1000, sales: 4, revenue: 900, ic: 30 }],
      new Date('2026-07-21T15:30:00.000Z'),
    );
    expect(summary.windows[6]).toMatchObject({ available: false, partial: true });
  });

  it('groups repeated ad names and calculates their metrics inside the window', () => {
    const summary = buildIntradaySummary(
      '2026-07-21',
      [
        {
          capturedAt: '2026-07-21T12:59:00.000Z',
          spend: 500,
          sales: 1,
          revenue: 200,
          ic: 10,
          ads: [{ name: 'FB196.2', spend: 500, sales: 1, revenue: 200, ic: 10 }],
        },
        {
          capturedAt: '2026-07-21T14:59:00.000Z',
          spend: 700,
          sales: 5,
          revenue: 1000,
          ic: 15,
          ads: [
            { name: 'FB196.2', spend: 650, sales: 4, revenue: 800, ic: 4 },
            { name: 'FB196.2', spend: 50, sales: 1, revenue: 200, ic: 1 },
          ],
        },
      ],
      new Date('2026-07-21T15:00:00.000Z'),
    );

    expect(summary.overallAds).toHaveLength(1);
    expect(summary.overallAds[0]).toMatchObject({
      name: 'FB196.2',
      spend: 700,
      sales: 5,
      revenue: 1000,
      ic: 5,
    });
    expect(summary.windows[5].adsAvailable).toBe(true);
    expect(summary.windows[5].ads).toHaveLength(1);
    expect(summary.windows[5].ads[0]).toMatchObject({
      name: 'FB196.2',
      spend: 200,
      sales: 4,
      revenue: 800,
      cpa: 50,
    });
  });
});
