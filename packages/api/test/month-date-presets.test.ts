import { describe, expect, it, vi } from 'vitest';
import { currentMonthRange, previousMonthRange, DASHBOARD_DATE_PRESETS, PERIOD_DATE_PRESETS } from '../../web/src/lib/date-range.js';

describe('calendar month presets', () => {
  it('uses month start through today', () => {
    expect(currentMonthRange('2026-10-08')).toEqual({ from: '2026-10-01', to: '2026-10-08' });
  });
  it('includes the entire previous month', () => {
    expect(previousMonthRange('2026-10-08')).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(previousMonthRange('2026-01-01')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
    expect(previousMonthRange('2024-03-10')).toEqual({ from: '2024-02-01', to: '2024-02-29' });
    expect(previousMonthRange('2026-03-10')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  });
  it('resolves click-time date in Sao Paulo, not UTC', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-11-01T01:00:00Z'));
      for (const presets of [DASHBOARD_DATE_PRESETS, PERIOD_DATE_PRESETS]) {
        expect(presets.find(p => p.id === 'current-month')!.getRange()).toEqual({ from: '2026-10-01', to: '2026-10-31' });
        expect(presets.find(p => p.id === 'previous-month')!.getRange()).toEqual({ from: '2026-09-01', to: '2026-09-30' });
      }
    } finally { vi.useRealTimers(); }
  });
});
