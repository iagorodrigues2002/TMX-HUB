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
});
