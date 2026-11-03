import type { DateRange } from './date-range';

// Mirrors the bounded snapshot query in GET /offers/:id/intraday/range.
// Receipt-based hourly revenue and the financial totals use separate queries.
export const INTRADAY_MAX_RANGE_DAYS = 60;
export const INTRADAY_RANGE_LIMIT_MESSAGE =
  'As janelas intradiárias de snapshots estão disponíveis para períodos de até 60 dias. Selecione um intervalo menor. Os totais e a Receita por hora mantêm o período completo.';

export function supportsIntradayRange({ from, to }: DateRange): boolean {
  const timestampOf = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return Number.NaN;
    const timestamp = Date.parse(`${value}T00:00:00.000Z`);
    return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value
      ? timestamp
      : Number.NaN;
  };
  const days = (timestampOf(to) - timestampOf(from)) / 86_400_000 + 1;
  return Number.isInteger(days) && days >= 1 && days <= INTRADAY_MAX_RANGE_DAYS;
}
