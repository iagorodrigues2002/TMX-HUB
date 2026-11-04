'use client';

import type { DateRange } from '@/lib/date-range';
import { useEffect, useState } from 'react';

export function useSettledOverviewFilters(period: DateRange, salesView: 'general' | 'natural') {
  const [selection, setSelection] = useState(() => ({ period, salesView }));
  const { from, to } = period;
  const pending =
    from !== selection.period.from ||
    to !== selection.period.to ||
    salesView !== selection.salesView;
  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => setSelection({ period: { from, to }, salesView }), 160);
    return () => clearTimeout(timer);
  }, [from, to, salesView, pending]);
  return { ...selection, pending };
}
