import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { HttpProblem } from '../src/lib/problem.js';
import errorHandlerPlugin from '../src/plugins/error-handler.js';
import healthRoutes from '../src/routes/health.js';

describe('readiness endpoints', () => {
  it('keeps public readiness aggregate-only and protects diagnostic details', async () => {
    const app = Fastify();
    app.decorate('requireAuth', async (request) => {
      if (request.headers.authorization !== 'Bearer valid') {
        throw new HttpProblem({ status: 401, title: 'Unauthorized' });
      }
    });
    await app.register(errorHandlerPlugin);
    await app.register(healthRoutes, {
      checkReadiness: async () => ({
        healthy: false,
        checks: {
          redis: { status: 'ok' },
          postgres: { status: 'fail', detail: 'postgres.internal:5432' },
        },
        env: { node: 'v22.test', playwrightBrowsersPath: '/private/chromium' },
      }),
    });

    try {
      const publicResponse = await app.inject({ method: 'GET', url: '/readyz' });
      expect(publicResponse.statusCode).toBe(503);
      expect(publicResponse.json()).toEqual({ status: 'degraded' });
      expect(publicResponse.body).not.toContain('postgres');
      expect(publicResponse.body).not.toContain('chromium');

      const unauthorized = await app.inject({ method: 'GET', url: '/internal/readyz' });
      expect(unauthorized.statusCode).toBe(401);

      const internal = await app.inject({
        method: 'GET',
        url: '/internal/readyz',
        headers: { authorization: 'Bearer valid' },
      });
      expect(internal.statusCode).toBe(503);
      expect(internal.json()).toMatchObject({
        status: 'degraded',
        checks: { postgres: { detail: 'postgres.internal:5432' } },
      });
    } finally {
      await app.close();
    }
  });
});
