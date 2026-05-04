import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import buildsRoutes from './builds.js';
import clonesRoutes from './clones.js';
import formsRoutes from './forms.js';
import healthRoutes from './health.js';
import inspectRoutes from './inspect.js';
import linksRoutes from './links.js';
import previewRoutes from './preview.js';
import vslJobsRoutes from './vsl-jobs.js';
import webhookTestRoutes from './webhook-test.js';

const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  // Health endpoints live at root, not under /v1.
  await app.register(healthRoutes);

  // Versioned API surface.
  await app.register(
    async (v1) => {
      await v1.register(clonesRoutes);
      await v1.register(inspectRoutes);
      await v1.register(previewRoutes);
      await v1.register(formsRoutes);
      await v1.register(linksRoutes);
      await v1.register(buildsRoutes);
      await v1.register(vslJobsRoutes);
      await v1.register(webhookTestRoutes);
    },
    { prefix: '/v1' },
  );
};

export default plugin;
