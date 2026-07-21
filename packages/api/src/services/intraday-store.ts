import type { DailySnapshot, SnapshotMetrics } from '@page-cloner/shared';
import type { Redis } from 'ioredis';
import { computeMetrics } from './snapshot-store.js';

const PREFIX = 'intraday:';
const TTL_SECONDS = 60 * 60 * 24 * 3;
const TIME_ZONE = 'America/Sao_Paulo';

export interface IntradayCheckpoint {
  capturedAt: string;
  spend: number;
  sales: number;
  revenue: number;
  ic: number;
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
}

export interface IntradaySummary {
  date: string;
  updatedAt?: string;
  overall: SnapshotMetrics;
  currentWindowIndex: number;
  windows: IntradayWindow[];
}

function key(offerId: string, date: string): string {
  return `${PREFIX}${offerId}:${date}`;
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
    return {
      index,
      label: `${String(startHour).padStart(2, '0')}h–${String(endHour).padStart(2, '0')}h`,
      startHour,
      endHour,
      available,
      partial: Boolean(last) && !baseline,
      samples: samples.length,
      metrics: last && baseline ? delta(last, baseline) : zeroMetrics(),
    };
  });

  return {
    date,
    ...(latest ? { updatedAt: latest.capturedAt } : {}),
    overall,
    currentWindowIndex,
    windows,
  };
}

export class IntradayStore {
  constructor(private readonly redis: Redis) {}

  async capture(offerId: string, snapshot: DailySnapshot, capturedAt = new Date()): Promise<void> {
    const local = saoPauloParts(capturedAt);
    if (snapshot.date !== local.date) return;
    const checkpoint: IntradayCheckpoint = {
      capturedAt: capturedAt.toISOString(),
      spend: snapshot.spend,
      sales: snapshot.sales,
      revenue: snapshot.revenue,
      ic: snapshot.ic,
    };
    const redisKey = key(offerId, local.date);
    await this.redis
      .multi()
      .zadd(redisKey, capturedAt.getTime(), JSON.stringify(checkpoint))
      .expire(redisKey, TTL_SECONDS)
      .exec();
  }

  async summary(offerId: string, now = new Date()): Promise<IntradaySummary> {
    const local = saoPauloParts(now);
    const members = await this.redis.zrange(key(offerId, local.date), 0, -1);
    const checkpoints = members.flatMap((member) => {
      try {
        return [JSON.parse(member) as IntradayCheckpoint];
      } catch {
        return [];
      }
    });
    return buildIntradaySummary(local.date, checkpoints, now);
  }

  async deleteAllForOffer(offerId: string): Promise<number> {
    let cursor = '0';
    let removed = 0;
    do {
      const [next, keys] = await this.redis.scan(cursor, 'MATCH', `${PREFIX}${offerId}:*`, 'COUNT', '50');
      cursor = next;
      if (keys.length) removed += await this.redis.del(...keys);
    } while (cursor !== '0');
    return removed;
  }
}
