import { Redis, type RedisOptions } from 'ioredis';

export function makeRedis(url: string, opts: RedisOptions = {}): Redis {
  const tls = url.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined;
  return new Redis(url, { ...(tls ? { tls } : {}), ...opts });
}
