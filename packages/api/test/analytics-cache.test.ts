import type { Redis } from 'ioredis';
import { describe, expect, it, vi } from 'vitest';
import { createAnalyticsCache } from '../src/plugins/analytics-cache.js';

class FakeRedis {
  readonly values = new Map<string, string>();
  readonly sets = new Map<string, Set<string>>();

  async get(key: string) {
    return this.values.get(key) ?? null;
  }

  async set(key: string, value: string) {
    this.values.set(key, value);
    return 'OK';
  }

  async sadd(key: string, value: string) {
    const values = this.sets.get(key) ?? new Set<string>();
    values.add(value);
    this.sets.set(key, values);
    return 1;
  }

  async expire() {
    return 1;
  }

  async smembers(key: string) {
    return [...(this.sets.get(key) ?? [])];
  }

  async del(...keys: string[]) {
    for (const key of keys) {
      this.values.delete(key);
      this.sets.delete(key);
    }
    return keys.length;
  }
}

const options = {
  endpoint: 'tracking-summary' as const,
  offerId: 'offer-1',
  from: '2026-10-01T03:00:00.000Z',
  to: '2026-10-02T03:00:00.000Z',
  ttlSeconds: 30 as const,
};

describe('analytics cache', () => {
  it('returns the Redis value on a cache hit', async () => {
    const redis = new FakeRedis();
    const cache = createAnalyticsCache(redis as unknown as Redis);
    const load = vi.fn(async () => ({ total: 7 }));

    expect(await cache.getOrSet(options, load)).toEqual({ total: 7 });
    expect(await cache.getOrSet(options, load)).toEqual({ total: 7 });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('coalesces concurrent misses into one loader call', async () => {
    const redis = new FakeRedis();
    const cache = createAnalyticsCache(redis as unknown as Redis);
    let release: ((value: { total: number }) => void) | undefined;
    const load = vi.fn(
      () =>
        new Promise<{ total: number }>((resolve) => {
          release = resolve;
        }),
    );

    const first = cache.getOrSet(options, load);
    const second = cache.getOrSet(options, load);
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    release?.({ total: 9 });

    await expect(Promise.all([first, second])).resolves.toEqual([{ total: 9 }, { total: 9 }]);
  });

  it('falls back to the loader when Redis is unavailable', async () => {
    const redis = {
      get: vi.fn(async () => {
        throw new Error('redis unavailable');
      }),
      set: vi.fn(async () => {
        throw new Error('redis unavailable');
      }),
    };
    const cache = createAnalyticsCache(redis as unknown as Redis);

    await expect(cache.getOrSet(options, async () => ({ total: 11 }))).resolves.toEqual({
      total: 11,
    });
  });

  it('invalidates every cached period tagged with an offer', async () => {
    const redis = new FakeRedis();
    const cache = createAnalyticsCache(redis as unknown as Redis);
    const load = vi.fn(async () => ({ total: 13 }));

    await cache.getOrSet(options, load);
    await cache.invalidate({ offerId: options.offerId });
    await cache.getOrSet(options, load);

    expect(load).toHaveBeenCalledTimes(2);
  });
});
