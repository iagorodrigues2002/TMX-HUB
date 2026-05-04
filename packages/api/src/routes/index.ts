import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import activityRoutes from './activity.js';
import authRoutes from './auth.js';
import buildsRoutes from './builds.js';
import clonesRoutes from './clones.js';
import formsRoutes from './forms.js';
import funnelJobsRoutes from './funnel-jobs.js';
import healthRoutes from './health.js';
import inspectRoutes from './inspect.js';
import linksRoutes from './links.js';
import pageDiffRoutes from './page-diff.js';
import previewRoutes from './preview.js';
import vslJobsRoutes from './vsl-jobs.js';
import webhookTestRoutes from './webhook-test.js';

const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  // Health endpoints live at root, public.
  await app.register(healthRoutes);

  // /v1 prefix.
  await app.register(
    async (v1) => {
      // Auth endpoints — explicitly public except /me which gates itself.
      await v1.register(authRoutes);

      // Preview is loaded inside an iframe (no Authorization header possible).
      // Stays public; the ULID in the URL is the capability token.
      await v1.register(previewRoutes);

      // Everything below requires a valid JWT.
      await v1.register(async (protectedRoutes) => {
        protectedRoutes.addHook('preHandler', (req) => app.requireAuth(req));
        await protectedRoutes.register(activityRoutes);
        await protectedRoutes.register(clonesRoutes);
        await protectedRoutes.register(inspectRoutes);
        await protectedRoutes.register(formsRoutes);
        await protectedRoutes.register(linksRoutes);
        await protectedRoutes.register(buildsRoutes);
        await protectedRoutes.register(vslJobsRoutes);
        await protectedRoutes.register(webhookTestRoutes);
        await protectedRoutes.register(pageDiffRoutes);
        await protectedRoutes.register(funnelJobsRoutes);
      });
    },
    { prefix: '/v1' },
  );
};

export default plugin;
