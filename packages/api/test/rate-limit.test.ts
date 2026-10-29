import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import errorHandlerPlugin from '../src/plugins/error-handler.js';
import rateLimitPlugin, {
  LOGIN_RATE_LIMIT,
  WEBHOOK_RATE_LIMIT,
  WEBHOOK_REPLAY_RATE_LIMIT,
} from '../src/plugins/rate-limit.js';

describe('rate limit availability', () => {
  it('allows 3000 general requests while preserving the separate login and webhook budgets', async () => {
    const counters = new Map<string, number>();
    const redis = {
      defineCommand: vi.fn(),
      rateLimit: (
        key: string,
        _window: number,
        _max: number,
        _continue: boolean,
        _backoff: boolean,
        callback: (error: Error | null, result: number[]) => void,
      ) => {
        const current = (counters.get(key) ?? 0) + 1;
        counters.set(key, current);
        callback(null, [current, 60000]);
      },
    };
    const app = Fastify();
    app.decorate('redis', redis as never);
    await app.register(rateLimitPlugin);
    app.get('/dashboard', async () => ({ ok: true }));
    app.post('/login', { config: { rateLimit: LOGIN_RATE_LIMIT } }, async () => ({ ok: true }));
    app.post('/webhook', { config: { rateLimit: WEBHOOK_RATE_LIMIT } }, async () => ({ ok: true }));
    try {
      const first = await app.inject('/dashboard');
      expect(first.headers['x-ratelimit-limit']).toBe('3000');
      for (let n = 1; n < 3000; n++) expect((await app.inject('/dashboard')).statusCode).toBe(200);
      expect((await app.inject('/dashboard')).statusCode).toBe(429);
      for (let n = 0; n < 10; n++)
        expect((await app.inject({ method: 'POST', url: '/login' })).statusCode).toBe(200);
      expect((await app.inject({ method: 'POST', url: '/login' })).statusCode).toBe(429);
      const webhook = await app.inject({ method: 'POST', url: '/webhook' });
      expect(webhook.statusCode).toBe(200);
      expect(webhook.headers['x-ratelimit-limit']).toBe('100');
    } finally {
      await app.close();
    }
  });
  it('fails closed with 503 when Redis cannot increment the limit', async () => {
    const redis = {
      defineCommand: vi.fn(),
      rateLimit: (...args: unknown[]) => {
        const callback = args.at(-1) as (error: Error) => void;
        callback(new Error('redis unavailable'));
      },
    };
    const app = Fastify();
    app.decorate('redis', redis as never);
    await app.register(rateLimitPlugin);
    await app.register(errorHandlerPlugin);
    app.post('/login', { config: { rateLimit: LOGIN_RATE_LIMIT } }, async () => ({ ok: true }));

    const response = await app.inject({ method: 'POST', url: '/login' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      statusCode: 503,
      code: 'rate_limit_unavailable',
    });
    await app.close();
  });

  it('uses stricter budgets for login, webhooks and quarantine replay', () => {
    expect(LOGIN_RATE_LIMIT.max).toBe(10);
    expect(WEBHOOK_RATE_LIMIT.max).toBe(100);
    expect(WEBHOOK_REPLAY_RATE_LIMIT.max).toBe(5);
  });
});
