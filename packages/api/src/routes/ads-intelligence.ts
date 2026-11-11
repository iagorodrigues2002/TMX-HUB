import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { registerCreativeDriveRoutes } from './ads-intelligence/creative-drive.js';
import { registerGetAdsIntelligenceRoutes } from './ads-intelligence/get-ads-intelligence.js';
import { registerPutAdsIntelligenceConnectionRoutes } from './ads-intelligence/put-ads-intelligence-connection.js';

const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  registerCreativeDriveRoutes(app);
  registerPutAdsIntelligenceConnectionRoutes(app);
  registerGetAdsIntelligenceRoutes(app);
};

export default plugin;
