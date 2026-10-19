import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { registerGetTrackingOverviewRoutes } from './tracking-overview/get-tracking-overview.js';

const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  registerGetTrackingOverviewRoutes(app);
};

export default plugin;
