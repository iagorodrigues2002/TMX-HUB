import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { HttpProblem } from '../src/lib/problem.js';
import errorHandlerPlugin from '../src/plugins/error-handler.js';
import healthRoutes, { checkReadiness } from '../src/routes/health.js';

describe('readiness endpoints', () => {
  it('treats optional dependency failures as warnings outside production', async () => {
    const app = {
      redis: { ping: async () => 'PONG' },
      db: async () => undefined,
      storage: { ping: async () => Promise.reject(new Error('MinIO unavailable')) },
    } as never;
    vi.stubEnv('NODE_ENV', 'development');

    try {
      const report = await checkReadiness(app);

      expect(report.healthy).toBe(true);
      expect(report.checks.s3).toMatchObject({
        status: 'warning',
        optional: true,
        detail: 'MinIO unavailable',
      });
      expect(report.checks.browser?.optional).toBe(true);

      const coreFailureReport = await checkReadiness({
        ...app,
        redis: { ping: async () => Promise.reject(new Error('Redis unavailable')) },
      } as never);
      expect(coreFailureReport.healthy).toBe(false);
      expect(coreFailureReport.checks.redis).toMatchObject({
        status: 'fail',
        detail: 'Redis unavailable',
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('keeps optional dependency failures strict in production unless explicitly skipped', async () => {
    const app = {
      redis: { ping: async () => 'PONG' },
      db: async () => undefined,
      storage: { ping: async () => Promise.reject(new Error('MinIO unavailable')) },
    } as never;
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('READYZ_SKIP_OPTIONAL', '');

    try {
      const strictReport = await checkReadiness(app);
      expect(strictReport.healthy).toBe(false);
      expect(strictReport.checks.s3).toMatchObject({ status: 'fail', optional: true });

      process.env.READYZ_SKIP_OPTIONAL = 'true';
      const skippedReport = await checkReadiness(app);
      expect(skippedReport.healthy).toBe(true);
      expect(skippedReport.checks.s3).toMatchObject({ status: 'warning', optional: true });
    } finally {
      vi.unstubAllEnvs();
    }
  });

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

  it('returns 200 publicly and exposes optional warnings internally', async () => {
    const app = Fastify();
    app.decorate('requireAuth', async () => undefined);
    await app.register(healthRoutes, {
      checkReadiness: async () => ({
        healthy: true,
        checks: {
          redis: { status: 'ok' },
          postgres: { status: 'ok' },
          s3: { status: 'warning', optional: true, detail: 'MinIO unavailable' },
          browser: { status: 'warning', optional: true, detail: 'Chromium unavailable' },
        },
        env: { node: 'v22.test', playwrightBrowsersPath: null },
      }),
    });

    try {
      const publicResponse = await app.inject({ method: 'GET', url: '/readyz' });
      expect(publicResponse.statusCode).toBe(200);
      expect(publicResponse.json()).toEqual({ status: 'ok' });

      const internal = await app.inject({
        method: 'GET',
        url: '/internal/readyz',
        headers: { authorization: 'Bearer valid' },
      });
      expect(internal.statusCode).toBe(200);
      expect(internal.json()).toMatchObject({
        status: 'ok',
        checks: {
          s3: { status: 'warning', optional: true },
          browser: { status: 'warning', optional: true },
        },
      });
    } finally {
      await app.close();
    }
  });
});
