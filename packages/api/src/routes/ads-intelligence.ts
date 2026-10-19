import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { registerGetAdsIntelligenceRoutes } from './ads-intelligence/get-ads-intelligence.js';
import { registerPutAdsIntelligenceConnectionRoutes } from './ads-intelligence/put-ads-intelligence-connection.js';

const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  registerPutAdsIntelligenceConnectionRoutes(app);
  registerGetAdsIntelligenceRoutes(app);
};

export default plugin;
