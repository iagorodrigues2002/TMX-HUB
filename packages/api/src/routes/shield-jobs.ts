import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { registerPostShieldJobsRoutes } from './shield-jobs/post-shield-jobs.js';

const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  registerPostShieldJobsRoutes(app);
};

export default plugin;
