import type { DailySnapshot } from '@page-cloner/shared';
import type { Redis } from 'ioredis';
import {
  type IntradayCheckpoint,
  type IntradayRangeSummary,
  type IntradayRangeWindow,
  type IntradaySummary,
  TIME_ZONE,
  buildIntradaySummary,
  enumerateDates,
  mergeAdMetrics,
  parseCheckpoints,
  previousIsoDate,
  saoPauloParts,
  sumRawMetrics,
} from './intraday-summary.js';
import { computeMetrics } from './snapshot-store.js';

const PREFIX = 'intraday:';
// Keep the same retention as daily snapshots so historical windows remain
// available without allowing Redis to grow forever.
const TTL_SECONDS = 60 * 60 * 24 * 365;
const MAX_CHECKPOINTS_PER_DAY = 100;

function key(offerId: string, date: string): string {
  return `${PREFIX}${offerId}:${date}`;
}

function summaryKey(offerId: string, date: string): string {
  return `${PREFIX}${offerId}:summary:${date}`;
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

  // Aggregates several days of already-archived (or live, for today) daily
  // summaries into one range. Raw per-checkpoint data doesn't survive past
  // days (see archiveDay), so this sums the additive fields (spend/sales/
  // revenue/ic) from each day's summary and recomputes ratios (cpa/roas/etc)
  // from the totals — never averages/sums the ratios themselves.
  async summaryRange(
    offerId: string,
    now: Date,
    fromDate: string,
    toDate: string,
  ): Promise<IntradayRangeSummary> {
    const dates = enumerateDates(fromDate, toDate);
    const summaries = await Promise.all(dates.map((date) => this.summary(offerId, now, date)));

    const overall = computeMetrics(sumRawMetrics(summaries.map((s) => s.overall)));
    const overallAds = mergeAdMetrics(summaries.map((s) => s.overallAds));

    const windows = Array.from({ length: 12 }, (_, index): IntradayRangeWindow => {
      const startHour = index * 2;
      const endHour = startHour + 2;
      const dayWindows = summaries.map((s) => s.windows[index]).filter((w) => w !== undefined);
      const availableDayWindows = dayWindows.filter((w) => w.available);
      const adsDayWindows = dayWindows.filter((w) => w.adsAvailable);
      const ads = mergeAdMetrics(adsDayWindows.map((w) => w.ads));
      return {
        index,
        label: `${String(startHour).padStart(2, '0')}h–${String(endHour).padStart(2, '0')}h`,
        startHour,
        endHour,
        available: availableDayWindows.length > 0,
        partial: dayWindows.some((w) => w.partial),
        samples: dayWindows.reduce((total, w) => total + w.samples, 0),
        daysAvailable: availableDayWindows.length,
        metrics: computeMetrics(sumRawMetrics(availableDayWindows.map((w) => w.metrics))),
        adsAvailable: ads.length > 0,
        adsPartial: dayWindows.some((w) => w.adsPartial),
        ads,
      };
    });

    const updatedAt = summaries
      .map((s) => s.updatedAt)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1);

    return {
      from: fromDate,
      to: toDate,
      timeZone: TIME_ZONE,
      ...(updatedAt ? { updatedAt } : {}),
      days: dates.length,
      overall,
      overallAds,
      windows,
    };
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

export {
  buildIntradaySummary,
  saoPauloParts,
  type IntradayAdMetrics,
  type IntradayCheckpoint,
  type IntradayRangeSummary,
  type IntradayRangeWindow,
  type IntradaySummary,
  type IntradayWindow,
} from './intraday-summary.js';
