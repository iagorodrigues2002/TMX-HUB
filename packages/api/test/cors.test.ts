import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import corsPlugin from '../src/plugins/cors.js';

const apps: Array<ReturnType<typeof Fastify>> = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('CORS preflight', () => {
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
