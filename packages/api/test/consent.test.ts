import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => vi.unstubAllEnvs());

describe('tracking consent recording', () => {
  it('upserts an explicit visitor consent decision', async () => {
    vi.stubEnv('JWT_SECRET', 'test-only-jwt-secret-at-least-32-characters');
    const { default: trackingPublicRoutes } = await import('../src/routes/tracking-public.js');
    const db = vi.fn(async (strings: TemplateStringsArray) => {
      const query = strings.join('?');
      if (query.includes('FROM tracking_projects')) return [{ id: 'project-1' }];
      if (query.includes('INSERT INTO tracking_consents')) return [{ state: 'granted' }];
      return [];
    });
    const app = Fastify();
    app.decorate('db', db);
    await app.register(trackingPublicRoutes);

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/consent/record',
        payload: {
          public_key: 'public-key-123456',
          visitor_id: 'visitor-12345678',
          consent: 'granted',
          version: 'cookie-banner-v1',
          purposes: ['analytics', 'advertising'],
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ recorded: true, consent: 'granted' });
      expect(
        db.mock.calls.some(([strings]) =>
          (strings as TemplateStringsArray).join('?').includes('INSERT INTO tracking_consents'),
        ),
      ).toBe(true);
    } finally {
      await app.close();
    }
  });
});
