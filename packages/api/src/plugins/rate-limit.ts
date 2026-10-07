import { createHash } from 'node:crypto';
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance, FastifyPluginAsync, FastifyRequest, RouteOptions } from 'fastify';
import { HttpProblem } from '../lib/problem.js';

type RateLimitResult = { current: number; ttl: number };
type RateLimitCallback = (error: Error | null, result?: RateLimitResult) => void;
type RateLimitStoreOptions = {
  continueExceeding?: boolean;
  exponentialBackoff?: boolean;
  max?: number;
  timeWindow?: number;
};

type RedisRateLimitClient = {
  defineCommand: (name: string, definition: { numberOfKeys: number; lua: string }) => void;
  rateLimit?: (
    key: string,
    timeWindow: number,
    max: number,
    continueExceeding: boolean,
    exponentialBackoff: boolean,
    callback: (error: Error | null, result?: [number, number]) => void,
  ) => void;
};

const rateLimitLua = `
  local current = redis.call('INCR', KEYS[1])
  local timeWindow = tonumber(ARGV[1])
  local max = tonumber(ARGV[2])
  local continueExceeding = ARGV[3] == 'true'
  local exponentialBackoff = ARGV[4] == 'true'
  local maxSafeInteger = (2^53) - 1
  if current == 1 or (continueExceeding and current > max) then
    redis.call('PEXPIRE', KEYS[1], timeWindow)
  elseif exponentialBackoff and current > max then
    local exponent = current - max - 1
    timeWindow = math.min(timeWindow * (2 ^ exponent), maxSafeInteger)
    redis.call('PEXPIRE', KEYS[1], timeWindow)
  else
    timeWindow = redis.call('PTTL', KEYS[1])
  end
  return {current, timeWindow}
`;

const unavailableProblem = () =>
  new HttpProblem({
    status: 503,
    title: 'Service Unavailable',
    detail: 'Rate limiting is temporarily unavailable.',
    code: 'rate_limit_unavailable',
  });

function createFailClosedRedisStore(redis: RedisRateLimitClient) {
  if (!redis.rateLimit) {
    redis.defineCommand('rateLimit', { numberOfKeys: 1, lua: rateLimitLua });
  }

  return class FailClosedRedisStore {
    constructor(
      private readonly options: RateLimitStoreOptions,
      private readonly prefix = 'rl:',
    ) {}

    incr(
      key: string,
      callback: RateLimitCallback,
      timeWindow = this.options.timeWindow ?? 60_000,
      max = this.options.max ?? 600,
    ) {
      const command = redis.rateLimit;
      if (!command) return callback(unavailableProblem());
      command.call(
        redis,
        `${this.prefix}${key}`,
        timeWindow,
        max,
        this.options.continueExceeding ?? false,
        this.options.exponentialBackoff ?? false,
        (error, result) => {
          if (error || !result) return callback(unavailableProblem());
          callback(null, { current: result[0], ttl: result[1] });
        },
      );
    }

    child(routeOptions: RouteOptions & { path: string; prefix: string }) {
      const method = Array.isArray(routeOptions.method)
        ? routeOptions.method.join('-')
        : routeOptions.method;
      const routeRateLimit =
        typeof routeOptions.config?.rateLimit === 'object'
          ? routeOptions.config.rateLimit
          : undefined;
      return new FailClosedRedisStore(
        {
          ...this.options,
          continueExceeding: routeRateLimit?.continueExceeding ?? this.options.continueExceeding,
          exponentialBackoff: routeRateLimit?.exponentialBackoff ?? this.options.exponentialBackoff,
        },
        `${this.prefix}${method}${routeOptions.url}-`,
      );
    }
  };
}

function tokenScopedKey(req: FastifyRequest) {
  const query = req.query as { token?: unknown };
  const token = typeof query?.token === 'string' ? query.token : '';
  const tokenScope = token
    ? createHash('sha256').update(token).digest('hex').slice(0, 24)
    : 'no-token';
  return `ip:${req.ip}:token:${tokenScope}`;
}

export const LOGIN_RATE_LIMIT = {
  max: 10,
  timeWindow: '1 minute',
  groupId: 'login',
  keyGenerator: (req: FastifyRequest) => `ip:${req.ip}`,
};

export const WEBHOOK_RATE_LIMIT = {
  max: 100,
  timeWindow: '1 minute',
  groupId: 'webhook',
  keyGenerator: tokenScopedKey,
};

export const WEBHOOK_REPLAY_RATE_LIMIT = {
  max: 5,
  timeWindow: '1 minute',
  groupId: 'webhook-replay',
  keyGenerator: tokenScopedKey,
};

export const INVITE_RATE_LIMIT = {
  max: 20,
  timeWindow: '1 hour',
  groupId: 'invite-create',
  keyGenerator: (req: FastifyRequest) =>
    `user:${(req as FastifyRequest & { user?: { sub: string } }).user?.sub ?? req.ip}`,
};

const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  const FailClosedRedisStore = createFailClosedRedisStore(
    app.redis as unknown as RedisRateLimitClient,
  );
  await app.register(rateLimit, {
    max: 600,
    timeWindow: '1 minute',
    store: FailClosedRedisStore,
    skipOnError: false,
    addHeaders: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
      'retry-after': true,
    },
    keyGenerator: (req) => {
      const apiKey = req.headers['x-api-key'];
      if (typeof apiKey === 'string' && apiKey.length > 0) return `key:${apiKey}`;
      return `ip:${req.ip}`;
    },
  });
};

(plugin as unknown as Record<symbol, boolean>)[Symbol.for('skip-override')] = true;

export default plugin;
