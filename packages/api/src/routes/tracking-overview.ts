import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { registerGetSaleNotices } from './tracking-overview/get-sale-notices.js';
import { registerGetTrackingOverviewRoutes } from './tracking-overview/get-tracking-overview.js';

const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  registerGetSaleNotices(app);
  registerGetTrackingOverviewRoutes(app);
};

export default plugin;
