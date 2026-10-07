import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthUserCache } from '../src/lib/auth-user-cache.js';
import { signJwt } from '../src/lib/jwt.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('AuthUserCache', () => {
  it('serves cached permissions until the TTL expires', () => {
    vi.useFakeTimers();
    try {
      const cache = new AuthUserCache(20_000, 1_000);
      cache.set('user-1', { role: 'user', allowedTools: ['cloner'] });

      expect(cache.get('user-1')).toEqual({ role: 'user', allowedTools: ['cloner'] });
      vi.advanceTimersByTime(20_001);
      expect(cache.get('user-1')).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('evicts the least recently used entry when it reaches max size', () => {
    const cache = new AuthUserCache(20_000, 2);
    cache.set('user-1', { role: 'user' });
    cache.set('user-2', { role: 'admin' });
    expect(cache.get('user-1')).toEqual({ role: 'user' });

    cache.set('user-3', { role: 'user', allowedTools: ['vsl'] });

    expect(cache.get('user-2')).toBeUndefined();
    expect(cache.get('user-1')).toEqual({ role: 'user' });
    expect(cache.get('user-3')).toEqual({ role: 'user', allowedTools: ['vsl'] });
  });

  it('invalidates a cached user explicitly', () => {
    const cache = new AuthUserCache(20_000, 1_000);
    cache.set('user-1', { role: 'admin' });

    cache.invalidate('user-1');

    expect(cache.get('user-1')).toBeUndefined();
  });

  it('avoids a second Redis read and reloads after invalidation', async () => {
    const secret = 'test-only-jwt-secret-at-least-32-characters';
    vi.stubEnv('JWT_SECRET', secret);
    vi.resetModules();
    const { default: authPlugin } = await import('../src/plugins/auth.js');
    const hgetall = vi.fn().mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      name: 'User',
      role: 'user',
      passwordHash: 'hash',
      createdAt: new Date().toISOString(),
    });
    const app = Fastify();
    app.decorate('redis', { hgetall } as never);
    await app.register(authPlugin);
    app.get('/protected', { preHandler: app.requireAuth }, async (request) => request.user);
    const { token } = signJwt({ sub: 'user-1', email: 'user@example.com', role: 'user' }, secret);

    try {
      const headers = { authorization: `Bearer ${token}` };
      expect((await app.inject({ url: '/protected', headers })).statusCode).toBe(200);
      expect((await app.inject({ url: '/protected', headers })).statusCode).toBe(200);
      expect(hgetall).toHaveBeenCalledTimes(1);

      app.invalidateAuthUser('user-1');
      expect((await app.inject({ url: '/protected', headers })).statusCode).toBe(200);
      expect(hgetall).toHaveBeenCalledTimes(2);
    } finally {
      await app.close();
    }
  });
});
