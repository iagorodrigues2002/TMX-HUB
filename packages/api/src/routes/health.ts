import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

interface CheckEntry {
  status: 'ok' | 'fail';
  detail?: string;
}

const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get('/healthz', async (_req, reply) => {
    return reply.send({ status: 'ok', uptime: process.uptime() });
  });

  app.get('/readyz', async (_req, reply) => {
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
      await app.storage.ping();
      checks.s3 = { status: 'ok' };
    } catch (err) {
      checks.s3 = { status: 'fail', detail: (err as Error)?.message ?? 'unknown error' };
      healthy = false;
    }

    // Browser check: confirm playwright + chromium executable is present.
    // This is the most common deploy-time failure for the render worker.
    try {
      // Dynamic import so the API can boot even if playwright isn't installed.
      // playwright is a peerDep of @page-cloner/core, not a direct dep of api.
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error - playwright resolved at runtime from core's deps.
      const playwrightMod = (await import('playwright')) as {
        chromium: { executablePath: () => string };
      };
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

    return reply.code(healthy ? 200 : 503).send({
      status: healthy ? 'ok' : 'degraded',
      checks,
      env: {
        node: process.version,
        playwrightBrowsersPath: process.env.PLAYWRIGHT_BROWSERS_PATH ?? null,
      },
    });
  });
};

export default plugin;
