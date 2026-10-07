import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { Redis } from 'ioredis';

export type AnalyticsCacheEndpoint =
  | 'tracking-summary'
  | 'tracking-attribution'
  | 'tracking-countries'
  | 'dashboard';

export type AnalyticsCacheOptions = {
  endpoint: AnalyticsCacheEndpoint;
  offerId: string;
  from: string;
  to: string;
  ttlSeconds: 30 | 60;
  tags?: string[];
};

export type AnalyticsCacheInvalidation = {
  offerId: string;
};

export interface AnalyticsCache {
  getOrSet<T>(options: AnalyticsCacheOptions, load: () => Promise<T>): Promise<T>;
  invalidate(options: AnalyticsCacheInvalidation): Promise<void>;
}

declare module 'fastify' {
  interface FastifyInstance {
    analyticsCache: AnalyticsCache;
    invalidateAnalyticsCache(options: AnalyticsCacheInvalidation): Promise<void>;
  }
}

type InFlightEntry = {
  promise: Promise<unknown>;
  tags: string[];
};

type HotCacheEntry = {
  value: unknown;
  expiresAt: number;
  tags: string[];
};

const CACHE_PREFIX = 'cache:analytics';
const TAG_TTL_SECONDS = 120;
const HOT_CACHE_TTL_MS = 1_000;
const HOT_CACHE_MAX_ENTRIES = 500;

const cacheKey = ({ endpoint, offerId, from, to }: AnalyticsCacheOptions) =>
  `${CACHE_PREFIX}:${endpoint}:${encodeURIComponent(offerId)}:${encodeURIComponent(from)}:${encodeURIComponent(to)}`;

const tagKey = (offerId: string) => `${CACHE_PREFIX}:tag:${encodeURIComponent(offerId)}`;

export function createAnalyticsCache(redis: Redis): AnalyticsCache {
  const inFlight = new Map<string, InFlightEntry>();
  const hotCache = new Map<string, HotCacheEntry>();
  const tagGenerations = new Map<string, number>();

  return {
    async getOrSet<T>(options: AnalyticsCacheOptions, load: () => Promise<T>): Promise<T> {
      const key = cacheKey(options);
      const hot = hotCache.get(key);
      if (hot && hot.expiresAt > Date.now()) return hot.value as T;
      if (hot) hotCache.delete(key);

      try {
        const cached = await redis.get(key);
        if (cached !== null) {
          const value = JSON.parse(cached) as T;
          hotCache.set(key, {
            value,
            expiresAt: Date.now() + HOT_CACHE_TTL_MS,
            tags: [...new Set(options.tags ?? [options.offerId])],
          });
          return value;
        }
      } catch {
        // Analytics must remain available when Redis is degraded.
      }

      const pending = inFlight.get(key);
      if (pending) return pending.promise as Promise<T>;

      const tags = [...new Set(options.tags ?? [options.offerId])];
      const generations = new Map(tags.map((tag) => [tag, tagGenerations.get(tag) ?? 0]));
      const promise = (async () => {
        const value = await load();
        const invalidatedWhileLoading = tags.some(
          (tag) => (tagGenerations.get(tag) ?? 0) !== generations.get(tag),
        );
        if (!invalidatedWhileLoading) {
          if (hotCache.size >= HOT_CACHE_MAX_ENTRIES) {
            const oldestKey = hotCache.keys().next().value;
            if (oldestKey) hotCache.delete(oldestKey);
          }
          hotCache.set(key, { value, expiresAt: Date.now() + HOT_CACHE_TTL_MS, tags });
          try {
            await redis.set(key, JSON.stringify(value), 'EX', options.ttlSeconds);
            await Promise.all(
              tags.map(async (tag) => {
                const indexKey = tagKey(tag);
                await redis.sadd(indexKey, key);
                await redis.expire(indexKey, TAG_TTL_SECONDS);
              }),
            );
          } catch {
            // The freshly computed response is still valid without Redis.
          }
        }
        return value;
      })();

      inFlight.set(key, { promise, tags });
      try {
        return await promise;
      } finally {
        if (inFlight.get(key)?.promise === promise) inFlight.delete(key);
      }
    },

    async invalidate({ offerId }: AnalyticsCacheInvalidation): Promise<void> {
      tagGenerations.set(offerId, (tagGenerations.get(offerId) ?? 0) + 1);
      for (const [key, entry] of inFlight) {
        if (entry.tags.includes(offerId)) inFlight.delete(key);
      }
      for (const [key, entry] of hotCache) {
        if (entry.tags.includes(offerId)) hotCache.delete(key);
      }

      const indexKey = tagKey(offerId);
      try {
        const keys = await redis.smembers(indexKey);
        await redis.del(...keys, indexKey);
      } catch {
        // Cache invalidation is best-effort and must not break ingestion.
      }
    },
  };
}

const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  const analyticsCache = createAnalyticsCache(app.redis);
  app.decorate('analyticsCache', analyticsCache);
  app.decorate('invalidateAnalyticsCache', (options: AnalyticsCacheInvalidation) =>
    analyticsCache.invalidate(options),
  );
};

(plugin as unknown as Record<symbol, boolean>)[Symbol.for('skip-override')] = true;

export default plugin;
