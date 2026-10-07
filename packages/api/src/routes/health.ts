import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

export interface CheckEntry {
  status: 'ok' | 'fail';
  detail?: string;
}

export interface ReadinessDetails {
  healthy: boolean;
  checks: Record<string, CheckEntry>;
  env: {
    node: string;
    playwrightBrowsersPath: string | null;
  };
}

export type HealthRouteOptions = {
  checkReadiness?: (app: FastifyInstance) => Promise<ReadinessDetails>;
};

export async function checkReadiness(app: FastifyInstance): Promise<ReadinessDetails> {
  const checks: Record<string, CheckEntry> = {};
  let healthy = true;

  try {
    const pong = await app.redis.ping();
    checks.redis =
      pong === 'PONG' ? { status: 'ok' } : { status: 'fail', detail: `unexpected: ${pong}` };
    if (checks.redis.status === 'fail') healthy = false;
  } catch (err) {
    checks.redis = { status: 'fail', detail: (err as Error)?.message ?? 'unknown error' };
    healthy = false;
  }

  try {
    if (!app.db) throw new Error('DATABASE_URL ausente');
    await app.db`SELECT 1`;
    checks.postgres = { status: 'ok' };
  } catch (err) {
    checks.postgres = { status: 'fail', detail: (err as Error)?.message ?? 'unknown error' };
    healthy = false;
  }

  try {
    await app.storage.ping();
    checks.s3 = { status: 'ok' };
  } catch (err) {
    checks.s3 = { status: 'fail', detail: (err as Error)?.message ?? 'unknown error' };
    healthy = false;
  }

  try {
    const playwrightMod = await import('playwright');
    const exePath = playwrightMod.chromium.executablePath();
    const fs = await import('node:fs');
    if (fs.existsSync(exePath)) {
      checks.browser = { status: 'ok', detail: exePath };
    } else {
      checks.browser = {
        status: 'fail',
        detail: `executable missing at ${exePath} (PLAYWRIGHT_BROWSERS_PATH=${process.env.PLAYWRIGHT_BROWSERS_PATH ?? '<unset>'})`,
      };
      healthy = false;
    }
  } catch (err) {
    checks.browser = {
      status: 'fail',
      detail: `playwright not loadable: ${(err as Error)?.message ?? 'unknown'}`,
    };
    healthy = false;
  }

  return {
    healthy,
    checks,
    env: {
      node: process.version,
      playwrightBrowsersPath: process.env.PLAYWRIGHT_BROWSERS_PATH ?? null,
    },
  };
}

const plugin: FastifyPluginAsync<HealthRouteOptions> = async (app, options) => {
  const readiness = options.checkReadiness ?? checkReadiness;

  app.get('/healthz', async (_req, reply) => {
    return reply.send({ status: 'ok', uptime: process.uptime() });
  });

  app.get('/readyz', async (_req, reply) => {
    const report = await readiness(app);
    return reply.code(report.healthy ? 200 : 503).send({
      status: report.healthy ? 'ok' : 'degraded',
    });
  });

  app.get(
    '/internal/readyz',
    { preHandler: (req) => app.requireAuth(req) },
    async (_req, reply) => {
      const report = await readiness(app);
      return reply.code(report.healthy ? 200 : 503).send({
        status: report.healthy ? 'ok' : 'degraded',
        checks: report.checks,
        env: report.env,
      });
    },
  );
};

export default plugin;
