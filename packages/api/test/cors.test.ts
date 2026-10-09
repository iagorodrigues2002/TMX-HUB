import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import corsPlugin from '../src/plugins/cors.js';

const apps: Array<ReturnType<typeof Fastify>> = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('CORS preflight', () => {
  it('allows anonymous tracking from landing pages without exposing authenticated APIs', async () => {
    const app = Fastify();
    apps.push(app);
    await app.register(corsPlugin);
    app.post('/v1/track/bootstrap', async () => ({ accepted: true }));
    app.post('/v1/track/events', async () => ({ accepted: true }));
    app.post('/v1/track/ab/assign', async () => ({ active: false }));
    app.put('/v1/offers/:id/ai-config', async () => ({ ok: true }));
    for (const url of ['/v1/track/bootstrap', '/v1/track/events', '/v1/track/ab/assign']) {
      const response = await app.inject({ method: 'OPTIONS', url, headers: {
        origin: 'https://clearmeadowx.online', 'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      } });
      expect(response.statusCode).toBe(204);
      expect(response.headers['access-control-allow-origin']).toBe('*');
      expect(response.headers['access-control-allow-credentials']).toBeUndefined();
      expect(response.headers['access-control-allow-headers']).not.toContain('authorization');
    }
    const admin = await app.inject({ method: 'OPTIONS', url: '/v1/offers/x/ai-config', headers: {
      origin: 'https://clearmeadowx.online', 'access-control-request-method': 'PUT',
    } });
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
