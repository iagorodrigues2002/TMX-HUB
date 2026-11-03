import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import corsPlugin from '../src/plugins/cors.js';

const apps: Array<ReturnType<typeof Fastify>> = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  vi.unstubAllEnvs();
});

describe('CORS preflight', () => {
  it.each(['development', 'test'])(
    'allows the live-copy preview login only from its exact local origin in %s',
    async (environment) => {
      vi.stubEnv('NODE_ENV', environment);
      const app = Fastify();
      apps.push(app);
      await app.register(corsPlugin);
      let handled = 0;
      app.post('/v1/auth/login', async () => ({ handled: ++handled }));
      const origin = 'http://localhost:3122';
      const preflight = await app.inject({
        method: 'OPTIONS',
        url: '/v1/auth/login',
        headers: {
          origin,
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'content-type',
        },
      });
      expect(preflight.statusCode).toBe(204);
      expect(preflight.headers['access-control-allow-origin']).toBe(origin);
      expect(preflight.headers['access-control-allow-credentials']).toBe('true');
      const response = await app.inject({
        method: 'POST',
        url: '/v1/auth/login',
        headers: { origin },
      });
      expect(response.statusCode).toBe(200);
      expect(response.headers['access-control-allow-origin']).toBe(origin);
      expect(handled).toBe(1);
      for (const unlisted of ['http://localhost:3123', 'https://localhost:3122']) {
        const denied = await app.inject({
          method: 'POST',
          url: '/v1/auth/login',
          headers: { origin: unlisted },
        });
        expect(denied.statusCode).toBeGreaterThanOrEqual(400);
        expect(denied.headers['access-control-allow-origin']).toBeUndefined();
      }
      expect(handled).toBe(1);
    },
  );
  it('never allows the live-copy local origin in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const app = Fastify();
    apps.push(app);
    await app.register(corsPlugin);
    let handled = 0;
    app.post('/v1/auth/login', async () => ({ handled: ++handled }));
    for (const method of ['OPTIONS', 'POST'] as const) {
      const denied = await app.inject({
        method,
        url: '/v1/auth/login',
        headers: {
          origin: 'http://localhost:3122',
          'access-control-request-method': 'POST',
        },
      });
      expect(denied.statusCode).toBeGreaterThanOrEqual(400);
      expect(denied.headers['access-control-allow-origin']).toBeUndefined();
    }
    expect(handled).toBe(0);
    const live = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      headers: { origin: 'https://theminex.com' },
    });
    expect(live.statusCode).toBe(200);
    expect(live.headers['access-control-allow-origin']).toBe('https://theminex.com');
    expect(handled).toBe(1);
  });
  it('allows anonymous tracking from landing pages without exposing authenticated APIs', async () => {
    const app = Fastify();
    apps.push(app);
    await app.register(corsPlugin);
    app.post('/v1/track/bootstrap', async () => ({ accepted: true }));
    app.post('/v1/track/events', async () => ({ accepted: true }));
    app.post('/v1/track/ab/assign', async () => ({ active: false }));
    app.put('/v1/offers/:id/ai-config', async () => ({ ok: true }));
    for (const url of ['/v1/track/bootstrap', '/v1/track/events', '/v1/track/ab/assign']) {
      const response = await app.inject({
        method: 'OPTIONS',
        url,
        headers: {
          origin: 'https://clearmeadowx.online',
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'content-type',
        },
      });
      expect(response.statusCode).toBe(204);
      expect(response.headers['access-control-allow-origin']).toBe('*');
      expect(response.headers['access-control-allow-credentials']).toBeUndefined();
      expect(response.headers['access-control-allow-headers']).not.toContain('authorization');
    }
    const admin = await app.inject({
      method: 'OPTIONS',
      url: '/v1/offers/x/ai-config',
      headers: {
        origin: 'https://clearmeadowx.online',
        'access-control-request-method': 'PUT',
      },
    });
    expect(admin.headers['access-control-allow-origin']).toBeUndefined();
  });
  it('allows the dashboard to save AI config with PUT', async () => {
    const app = Fastify();
    apps.push(app);
    await app.register(corsPlugin);
    app.put('/v1/offers/:id/ai-config', async () => ({ ok: true }));

    const response = await app.inject({
      method: 'OPTIONS',
      url: '/v1/offers/offer-sdm/ai-config',
      headers: {
        origin: 'https://theminex.com',
        'access-control-request-method': 'PUT',
        'access-control-request-headers': 'authorization,content-type',
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('https://theminex.com');
    expect(response.headers['access-control-allow-methods']).toContain('PUT');
    expect(response.headers['access-control-allow-headers']).toContain('authorization');
  });
});
