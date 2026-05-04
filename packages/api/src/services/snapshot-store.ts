import type { Redis } from 'ioredis';
import type { AdsetSnapshot, DailySnapshot, SnapshotMetrics } from '@page-cloner/shared';

const SNAPSHOT_PREFIX = 'snapshot:'; // {offerId}:{date} → hash
// 1-year TTL on snapshots — long enough for trend analysis, short enough not to balloon Redis.
const SNAPSHOT_TTL_SEC = 60 * 60 * 24 * 365;

function key(offerId: string, date: string): string {
  return `${SNAPSHOT_PREFIX}${offerId}:${date}`;
}

function emptyMetrics(): SnapshotMetrics {
  return {
    spend: 0,
    sales: 0,
    revenue: 0,
    ic: 0,
    cpa: null,
    icCpa: null,
    conversionRate: null,
    roas: null,
  };
}

export function computeMetrics(parts: {
  spend: number;
  sales: number;
  revenue: number;
  ic: number;
}): SnapshotMetrics {
  return {
    spend: parts.spend,
    sales: parts.sales,
    revenue: parts.revenue,
    ic: parts.ic,
    cpa: parts.sales > 0 ? parts.spend / parts.sales : null,
    icCpa: parts.ic > 0 ? parts.spend / parts.ic : null,
    conversionRate: parts.ic > 0 ? parts.sales / parts.ic : null,
    roas: parts.spend > 0 ? parts.revenue / parts.spend : null,
  };
}

export class SnapshotStore {
  constructor(private readonly redis: Redis) {}

  /**
   * Idempotent — re-ingesting (offerId, date) overwrites the previous snapshot.
   */
  async upsert(snapshot: DailySnapshot): Promise<void> {
    const k = key(snapshot.offerId, snapshot.date);
    const data: Record<string, string> = {
      offerId: snapshot.offerId,
      date: snapshot.date,
      spend: String(snapshot.spend),
      sales: String(snapshot.sales),
      revenue: String(snapshot.revenue),
      ic: String(snapshot.ic),
      updatedAt: snapshot.updatedAt,
    };
    if (snapshot.impressions !== undefined) data.impressions = String(snapshot.impressions);
    if (snapshot.clicks !== undefined) data.clicks = String(snapshot.clicks);
    if (snapshot.adsets) data.adsets = JSON.stringify(snapshot.adsets);
    await this.redis
      .multi()
      .del(k) // ensure stale optional fields aren't left behind
      .hset(k, data)
      .expire(k, SNAPSHOT_TTL_SEC)
      .exec();
  }

  async get(offerId: string, date: string): Promise<DailySnapshot | null> {
    const data = await this.redis.hgetall(key(offerId, date));
    if (!data || Object.keys(data).length === 0) return null;
    return this.deserialize(data);
  }

  /**
   * Range query — inclusive on both ends. We call HGETALL in a pipeline because
   * Redis has no native "range over hashes". Caller passes ISO YYYY-MM-DD.
   */
  async listRange(offerId: string, fromDate: string, toDate: string): Promise<DailySnapshot[]> {
    const dates = expandDateRange(fromDate, toDate);
    if (dates.length === 0) return [];
    const pipe = this.redis.pipeline();
    for (const d of dates) pipe.hgetall(key(offerId, d));
    const results = (await pipe.exec()) ?? [];
    const out: DailySnapshot[] = [];
    for (const [, data] of results) {
      if (!data || typeof data !== 'object') continue;
      const rec = data as Record<string, string>;
      if (!rec.date) continue;
      out.push(this.deserialize(rec));
    }
    return out.sort((a, b) => (a.date < b.date ? -1 : 1));
  }

  /** Sum all snapshots in the range into a single metrics blob. */
  aggregate(snapshots: DailySnapshot[]): SnapshotMetrics {
    if (snapshots.length === 0) return emptyMetrics();
    let spend = 0;
    let sales = 0;
    let revenue = 0;
    let ic = 0;
    for (const s of snapshots) {
      spend += s.spend;
      sales += s.sales;
      revenue += s.revenue;
      ic += s.ic;
    }
    return computeMetrics({ spend, sales, revenue, ic });
  }

  /** Delete every snapshot for an offer (used when removing the offer). */
  async deleteAllForOffer(offerId: string): Promise<number> {
    let cursor = '0';
    let total = 0;
    do {
      const [next, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        `${SNAPSHOT_PREFIX}${offerId}:*`,
        'COUNT',
        '200',
      );
      cursor = next;
      if (keys.length > 0) {
        total += await this.redis.del(...keys);
      }
    } while (cursor !== '0');
    return total;
  }

  private deserialize(data: Record<string, string>): DailySnapshot {
    let adsets: AdsetSnapshot[] | undefined;
    if (data.adsets) {
      try {
        adsets = JSON.parse(data.adsets);
      } catch {
        adsets = undefined;
      }
    }
    const snap: DailySnapshot = {
      offerId: data.offerId ?? '',
      date: data.date ?? '',
      spend: Number.parseFloat(data.spend ?? '0') || 0,
      sales: Number.parseInt(data.sales ?? '0', 10) || 0,
      revenue: Number.parseFloat(data.revenue ?? '0') || 0,
      ic: Number.parseInt(data.ic ?? '0', 10) || 0,
      updatedAt: data.updatedAt ?? '',
    };
    if (data.impressions) snap.impressions = Number.parseInt(data.impressions, 10) || 0;
    if (data.clicks) snap.clicks = Number.parseInt(data.clicks, 10) || 0;
    if (adsets) snap.adsets = adsets;
    return snap;
  }
}

/**
 * Expand "YYYY-MM-DD" .. "YYYY-MM-DD" into the inclusive list of dates.
 * Hard-capped at 366 days so a malformed input can't blow up Redis.
 */
function expandDateRange(from: string, to: string): string[] {
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
  if (end < start) return [];
  const out: string[] = [];
  const cursor = new Date(start);
  let safety = 0;
  while (cursor <= end && safety < 366) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    safety += 1;
  }
  return out;
}
