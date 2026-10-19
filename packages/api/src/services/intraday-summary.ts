import type { AdSnapshot, SnapshotMetrics } from '@page-cloner/shared';
import { computeMetrics } from './snapshot-store.js';

export const TIME_ZONE = 'America/Sao_Paulo';

export interface IntradayCheckpoint {
  capturedAt: string;
  spend: number;
  sales: number;
  revenue: number;
  ic: number;
  ads?: AdSnapshot[];
}

export interface IntradayAdMetrics extends SnapshotMetrics {
  name: string;
}

export interface IntradayWindow {
  index: number;
  label: string;
  startHour: number;
  endHour: number;
  available: boolean;
  partial: boolean;
  samples: number;
  metrics: SnapshotMetrics;
  adsAvailable: boolean;
  adsPartial: boolean;
  ads: IntradayAdMetrics[];
}

export interface IntradaySummary {
  date: string;
  timeZone: typeof TIME_ZONE;
  updatedAt?: string;
  overall: SnapshotMetrics;
  overallAds: IntradayAdMetrics[];
  currentWindowIndex: number;
  windows: IntradayWindow[];
}

export interface IntradayRangeWindow {
  index: number;
  label: string;
  startHour: number;
  endHour: number;
  available: boolean;
  partial: boolean;
  samples: number;
  daysAvailable: number;
  metrics: SnapshotMetrics;
  adsAvailable: boolean;
  adsPartial: boolean;
  ads: IntradayAdMetrics[];
}

export interface IntradayRangeSummary {
  from: string;
  to: string;
  timeZone: typeof TIME_ZONE;
  updatedAt?: string;
  days: number;
  overall: SnapshotMetrics;
  overallAds: IntradayAdMetrics[];
  windows: IntradayRangeWindow[];
}

export function previousIsoDate(date: string): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}

export function nextIsoDate(date: string): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

export function enumerateDates(from: string, to: string): string[] {
  const dates: string[] = [];
  let cursor = from;
  while (cursor <= to) {
    dates.push(cursor);
    cursor = nextIsoDate(cursor);
  }
  return dates;
}

export function sumRawMetrics(
  entries: Array<{ spend: number; sales: number; revenue: number; ic: number }>,
) {
  return entries.reduce(
    (acc, entry) => ({
      spend: acc.spend + entry.spend,
      sales: acc.sales + entry.sales,
      revenue: acc.revenue + entry.revenue,
      ic: acc.ic + entry.ic,
    }),
    { spend: 0, sales: 0, revenue: 0, ic: 0 },
  );
}

export function mergeAdMetrics(adLists: IntradayAdMetrics[][]): IntradayAdMetrics[] {
  const grouped = new Map<string, { spend: number; sales: number; revenue: number; ic: number }>();
  for (const ads of adLists) {
    for (const ad of ads) {
      const current = grouped.get(ad.name) ?? { spend: 0, sales: 0, revenue: 0, ic: 0 };
      current.spend += ad.spend;
      current.sales += ad.sales;
      current.revenue += ad.revenue;
      current.ic += ad.ic;
      grouped.set(ad.name, current);
    }
  }
  return [...grouped.entries()]
    .map(([name, raw]) => ({ name, ...computeMetrics(raw) }))
    .sort((a, b) => b.revenue - a.revenue || b.spend - a.spend);
}

export function saoPauloParts(at: Date): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return {
    date: `${value('year')}-${value('month')}-${value('day')}`,
    hour: Number.parseInt(value('hour'), 10) || 0,
  };
}

export function zeroMetrics(): SnapshotMetrics {
  return computeMetrics({ spend: 0, sales: 0, revenue: 0, ic: 0 });
}

export function delta(current: IntradayCheckpoint, baseline: IntradayCheckpoint): SnapshotMetrics {
  return computeMetrics({
    spend: Math.max(0, current.spend - baseline.spend),
    sales: Math.max(0, current.sales - baseline.sales),
    revenue: Math.max(0, current.revenue - baseline.revenue),
    ic: Math.max(0, current.ic - baseline.ic),
  });
}

export function groupedAds(ads: AdSnapshot[] | undefined): Map<string, AdSnapshot> {
  const grouped = new Map<string, AdSnapshot>();
  for (const ad of ads ?? []) {
    const name = ad.name.trim();
    if (!name) continue;
    const current = grouped.get(name) ?? { name, spend: 0, sales: 0, revenue: 0, ic: 0 };
    current.spend += ad.spend;
    current.sales += ad.sales;
    current.revenue += ad.revenue;
    current.ic += ad.ic;
    grouped.set(name, current);
  }
  return grouped;
}

export function adMetrics(
  current: IntradayCheckpoint,
  baseline?: IntradayCheckpoint,
): IntradayAdMetrics[] {
  const currentAds = groupedAds(current.ads);
  const baselineAds = groupedAds(baseline?.ads);
  return [...currentAds.values()]
    .map((ad) => {
      const previous = baselineAds.get(ad.name);
      return {
        name: ad.name,
        ...computeMetrics({
          spend: Math.max(0, ad.spend - (previous?.spend ?? 0)),
          sales: Math.max(0, ad.sales - (previous?.sales ?? 0)),
          revenue: Math.max(0, ad.revenue - (previous?.revenue ?? 0)),
          ic: Math.max(0, ad.ic - (previous?.ic ?? 0)),
        }),
      };
    })
    .filter((ad) => ad.spend > 0 || ad.sales > 0 || ad.revenue > 0 || ad.ic > 0)
    .sort((a, b) => b.revenue - a.revenue || b.spend - a.spend);
}

export function buildIntradaySummary(
  date: string,
  checkpoints: IntradayCheckpoint[],
  now = new Date(),
): IntradaySummary {
  const ordered = [...checkpoints].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
  const localNow = saoPauloParts(now);
  const currentWindowIndex = localNow.date === date ? Math.floor(localNow.hour / 2) : 11;
  const latest = ordered.at(-1);
  const overall = latest
    ? computeMetrics({
        spend: latest.spend,
        sales: latest.sales,
        revenue: latest.revenue,
        ic: latest.ic,
      })
    : zeroMetrics();
  const overallAds = latest ? adMetrics(latest) : [];

  const windows = Array.from({ length: 12 }, (_, index): IntradayWindow => {
    const startHour = index * 2;
    const endHour = startHour + 2;
    const samples = ordered.filter((sample) => {
      const local = saoPauloParts(new Date(sample.capturedAt));
      return local.date === date && Math.floor(local.hour / 2) === index;
    });
    const baseline = [...ordered].reverse().find((sample) => {
      const local = saoPauloParts(new Date(sample.capturedAt));
      return local.date === date && Math.floor(local.hour / 2) < index;
    });
    const last = samples.at(-1);
    const available = Boolean(last && baseline);
    const previousWithAds = [...ordered].reverse().find((sample) => {
      const local = saoPauloParts(new Date(sample.capturedAt));
      return local.date === date && Math.floor(local.hour / 2) < index && sample.ads?.length;
    });
    const samplesWithAds = samples.filter((sample) => sample.ads?.length);
    const partialAdBaseline = samplesWithAds.length > 1 ? samplesWithAds[0] : undefined;
    const adBaseline = previousWithAds ?? partialAdBaseline;
    const adsAvailable = Boolean(last?.ads?.length && adBaseline && adBaseline !== last);
    return {
      index,
      label: `${String(startHour).padStart(2, '0')}h–${String(endHour).padStart(2, '0')}h`,
      startHour,
      endHour,
      available,
      partial: Boolean(last) && !baseline,
      samples: samples.length,
      metrics: last && baseline ? delta(last, baseline) : zeroMetrics(),
      adsAvailable,
      adsPartial: adsAvailable && !previousWithAds,
      ads: last && adBaseline ? adMetrics(last, adBaseline) : [],
    };
  });

  return {
    date,
    timeZone: TIME_ZONE,
    ...(latest ? { updatedAt: latest.capturedAt } : {}),
    overall,
    overallAds,
    currentWindowIndex,
    windows,
  };
}

export function parseCheckpoints(members: string[]): IntradayCheckpoint[] {
  return members.flatMap((member) => {
    try {
      return [JSON.parse(member) as IntradayCheckpoint];
    } catch {
      return [];
    }
  });
}
