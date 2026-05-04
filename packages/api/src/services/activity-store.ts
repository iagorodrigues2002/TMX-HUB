import type { Redis } from 'ioredis';
import type { ActivityEntry, ActivityKind } from '@page-cloner/shared';

/**
 * Per-user activity feed. Stored as a Redis sorted set where the score is the
 * unix timestamp and the member is `kind:id`. The full record (label, status)
 * lives in a hash so the listing is one MGET away.
 */

const FEED_PREFIX = 'activity:'; // {userId} → zset of "kind:id" by ts
const ENTRY_PREFIX = 'activity-entry:'; // {userId}:{kind}:{id} → hash

const MAX_FEED_ENTRIES = 200;

function feedKey(userId: string): string {
  return `${FEED_PREFIX}${userId}`;
}

function entryKey(userId: string, kind: ActivityKind, id: string): string {
  return `${ENTRY_PREFIX}${userId}:${kind}:${id}`;
}

export class ActivityStore {
  constructor(private readonly redis: Redis) {}

  async record(userId: string, entry: ActivityEntry): Promise<void> {
    if (!userId) return;
    const ts = Date.parse(entry.createdAt) || Date.now();
    const member = `${entry.kind}:${entry.id}`;
    await this.redis
      .multi()
      .zadd(feedKey(userId), ts, member)
      // Trim to MAX_FEED_ENTRIES newest.
      .zremrangebyrank(feedKey(userId), 0, -MAX_FEED_ENTRIES - 1)
      .hset(entryKey(userId, entry.kind, entry.id), {
        kind: entry.kind,
        id: entry.id,
        label: entry.label,
        status: entry.status,
        createdAt: entry.createdAt,
      })
      .expire(entryKey(userId, entry.kind, entry.id), 60 * 60 * 24 * 90)
      .expire(feedKey(userId), 60 * 60 * 24 * 90)
      .exec();
  }

  async updateStatus(userId: string, kind: ActivityKind, id: string, status: string): Promise<void> {
    if (!userId) return;
    await this.redis.hset(entryKey(userId, kind, id), { status });
  }

  async list(userId: string, limit = 50): Promise<ActivityEntry[]> {
    if (!userId) return [];
    // ZRANGE with REV to get newest first.
    const members = await this.redis.zrange(feedKey(userId), 0, limit - 1, 'REV');
    if (members.length === 0) return [];
    const pipeline = this.redis.pipeline();
    for (const m of members) {
      const [kind, id] = m.split(':') as [ActivityKind, string];
      pipeline.hgetall(entryKey(userId, kind, id));
    }
    const results = (await pipeline.exec()) ?? [];
    const out: ActivityEntry[] = [];
    for (const [, data] of results) {
      if (!data || typeof data !== 'object') continue;
      const rec = data as Record<string, string>;
      if (!rec.id) continue;
      out.push({
        kind: rec.kind as ActivityKind,
        id: rec.id,
        label: rec.label ?? '',
        status: rec.status ?? '',
        createdAt: rec.createdAt ?? '',
      });
    }
    return out;
  }
}
