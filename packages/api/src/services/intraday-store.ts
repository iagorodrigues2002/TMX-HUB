import type { AdSnapshot, DailySnapshot, SnapshotMetrics } from '@page-cloner/shared';
import type { Redis } from 'ioredis';
import { computeMetrics } from './snapshot-store.js';

const PREFIX = 'intraday:';
// Keep the same retention as daily snapshots so historical windows remain
// available without allowing Redis to grow forever.
const TTL_SECONDS = 60 * 60 * 24 * 365;
const MAX_CHECKPOINTS_PER_DAY = 100;
const TIME_ZONE = 'America/Sao_Paulo';

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
  updatedAt?: string;
  overall: SnapshotMetrics;
  overallAds: IntradayAdMetrics[];
  currentWindowIndex: number;
  windows: IntradayWindow[];
}

function key(offerId: string, date: string): string {
  return `${PREFIX}${offerId}:${date}`;
}

function summaryKey(offerId: string, date: string): string {
  return `${PREFIX}${offerId}:summary:${date}`;
}

function previousIsoDate(date: string): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
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

function zeroMetrics(): SnapshotMetrics {
  return computeMetrics({ spend: 0, sales: 0, revenue: 0, ic: 0 });
}

function delta(current: IntradayCheckpoint, baseline: IntradayCheckpoint): SnapshotMetrics {
  return computeMetrics({
    spend: Math.max(0, current.spend - baseline.spend),
    sales: Math.max(0, current.sales - baseline.sales),
    revenue: Math.max(0, current.revenue - baseline.revenue),
    ic: Math.max(0, current.ic - baseline.ic),
  });
}

function groupedAds(ads: AdSnapshot[] | undefined): Map<string, AdSnapshot> {
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

function adMetrics(
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
    ...(latest ? { updatedAt: latest.capturedAt } : {}),
    overall,
    overallAds,
    currentWindowIndex,
    windows,
  };
}

export class IntradayStore {
  constructor(private readonly redis: Redis) {}

  async capture(offerId: string, snapshot: DailySnapshot, capturedAt = new Date()): Promise<void> {
    const local = saoPauloParts(capturedAt);
    if (snapshot.date !== local.date) return;
    await this.archiveDay(offerId, previousIsoDate(local.date), capturedAt);
    const checkpoint: IntradayCheckpoint = {
      capturedAt: capturedAt.toISOString(),
      spend: snapshot.spend,
      sales: snapshot.sales,
      revenue: snapshot.revenue,
      ic: snapshot.ic,
      ads: snapshot.ads,
    };
    const redisKey = key(offerId, local.date);
    await this.redis
      .multi()
      .zadd(redisKey, capturedAt.getTime(), JSON.stringify(checkpoint))
      .zremrangebyrank(redisKey, 0, -(MAX_CHECKPOINTS_PER_DAY + 1))
      .expire(redisKey, TTL_SECONDS)
      .exec();
  }

  async summary(
    offerId: string,
    now = new Date(),
    requestedDate?: string,
  ): Promise<IntradaySummary> {
    const local = saoPauloParts(now);
    const date = requestedDate ?? local.date;
    if (date !== local.date) await this.archiveDay(offerId, date, now);
    const pipeline = this.redis.pipeline();
    pipeline.zrange(key(offerId, date), 0, -1);
    pipeline.get(summaryKey(offerId, date));
    const results = (await pipeline.exec()) ?? [];
    const members = Array.isArray(results[0]?.[1]) ? (results[0]![1] as string[]) : [];
    const checkpoints = parseCheckpoints(members);
    if (checkpoints.length === 0 && typeof results[1]?.[1] === 'string') {
      try {
        return JSON.parse(results[1][1]) as IntradaySummary;
      } catch {
        // A malformed materialized summary must not break the dashboard.
      }
    }
    return buildIntradaySummary(date, checkpoints, now);
  }

  private async archiveDay(offerId: string, date: string, now: Date): Promise<void> {
    const archivedKey = summaryKey(offerId, date);
    if (await this.redis.exists(archivedKey)) return;
    const rawKey = key(offerId, date);
    const checkpoints = parseCheckpoints(await this.redis.zrange(rawKey, 0, -1));
    if (checkpoints.length === 0) return;
    const summary = buildIntradaySummary(date, checkpoints, now);
    await this.redis
      .multi()
      .set(archivedKey, JSON.stringify(summary), 'EX', TTL_SECONDS)
      .del(rawKey)
      .exec();
  }

  async deleteAllForOffer(offerId: string): Promise<number> {
    let cursor = '0';
    let removed = 0;
    do {
      const [next, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        `${PREFIX}${offerId}:*`,
        'COUNT',
        '50',
      );
      cursor = next;
      if (keys.length) removed += await this.redis.del(...keys);
    } while (cursor !== '0');
    return removed;
  }
}

function parseCheckpoints(members: string[]): IntradayCheckpoint[] {
  return members.flatMap((member) => {
    try {
      return [JSON.parse(member) as IntradayCheckpoint];
    } catch {
      return [];
    }
  });
}
