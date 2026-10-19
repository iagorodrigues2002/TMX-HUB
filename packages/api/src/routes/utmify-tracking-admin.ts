import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { registerGetUtmifyDestinationRoutes } from './utmify-tracking-admin/get-utmify-destination.js';
import { registerPostUtmifyUpsellsReconcileRoutes } from './utmify-tracking-admin/post-utmify-upsells-reconcile.js';

const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  registerGetUtmifyDestinationRoutes(app);
  registerPostUtmifyUpsellsReconcileRoutes(app);
};

export default plugin;
