export const SAO_PAULO_TIME_ZONE = 'America/Sao_Paulo';

export interface DateRange {
  from: string;
  to: string;
}

export interface DateRangePreset {
  id: string;
  label: string;
  getRange: () => DateRange;
}

export function toIsoDateInTimeZone(
  value: Date | string | number = new Date(),
  timeZone = SAO_PAULO_TIME_ZONE,
): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function todayIso(): string {
  return toIsoDateInTimeZone();
}

export function daysAgoIso(days: number, anchor = todayIso()): string {
  const [year = 1970, month = 1, day = 1] = anchor.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day - days, 12));
  return date.toISOString().slice(0, 10);
}

export function singleDayRange(daysAgo: number): DateRange {
  const date = daysAgoIso(daysAgo);
  return { from: date, to: date };
}

export function rollingDateRange(days: number): DateRange {
  const safeDays = Math.max(1, Math.floor(days));
  return { from: daysAgoIso(safeDays - 1), to: todayIso() };
}

export function isDateInRange(value: string, range: DateRange): boolean {
  const date = toIsoDateInTimeZone(value);
  return date >= range.from && date <= range.to;
}

export const DASHBOARD_DATE_PRESETS: readonly DateRangePreset[] = [
  { id: 'today', label: 'Hoje', getRange: () => singleDayRange(0) },
  { id: 'yesterday', label: 'Ontem', getRange: () => singleDayRange(1) },
  { id: 'day-before-yesterday', label: 'Anteontem', getRange: () => singleDayRange(2) },
  { id: 'last-7-days', label: 'Últimos 7 dias', getRange: () => rollingDateRange(7) },
  { id: 'last-30-days', label: 'Últimos 30 dias', getRange: () => rollingDateRange(30) },
];

export const PERIOD_DATE_PRESETS: readonly DateRangePreset[] = [
  { id: 'today', label: 'Hoje', getRange: () => singleDayRange(0) },
  { id: 'last-7-days', label: 'Últimos 7 dias', getRange: () => rollingDateRange(7) },
  { id: 'last-14-days', label: 'Últimos 14 dias', getRange: () => rollingDateRange(14) },
  { id: 'last-30-days', label: 'Últimos 30 dias', getRange: () => rollingDateRange(30) },
];
