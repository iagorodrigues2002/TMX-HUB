import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import errorHandlerPlugin from '../src/plugins/error-handler.js';
import rateLimitPlugin, {
  LOGIN_RATE_LIMIT,
  WEBHOOK_RATE_LIMIT,
  WEBHOOK_REPLAY_RATE_LIMIT,
} from '../src/plugins/rate-limit.js';

describe('rate limit availability', () => {
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
