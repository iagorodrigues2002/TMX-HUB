import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { createCnameTargetContext } from './tracking-advanced/cname-target-context.js';
import { registerDeleteUpsellsStageIdRoutes } from './tracking-advanced/delete-upsells-stage-id.js';
import { registerGetAdvancedRoutes } from './tracking-advanced/get-advanced.js';
import { registerGetUpsellIdentitiesOrderIdStagesStageIdSyzepayCheckRoutes } from './tracking-advanced/get-upsell-identities-order-id-stages-stage-id-syzepay-check.js';
import { registerGetUpsellIdentitiesRoutes } from './tracking-advanced/get-upsell-identities.js';
import { registerGetVturbAnalyticsRoutes } from './tracking-advanced/get-vturb-analytics.js';
import { registerPostAbTestsRoutes } from './tracking-advanced/post-ab-tests.js';
import { registerPostMetaPurchasesReconcileRoutes } from './tracking-advanced/post-meta-purchases-reconcile.js';
import { registerPostUpsellIdentitiesReconcileRoutes } from './tracking-advanced/post-upsell-identities-reconcile.js';
import { registerSetupRoutes } from './tracking-advanced/setup.js';
export { mergeAdvancedGateways } from './tracking-advanced/database-unavailable.js';

const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  registerSetupRoutes(app);
  const context0 = createCnameTargetContext(app);
  registerGetAdvancedRoutes(app, context0);
  registerGetVturbAnalyticsRoutes(app, context0);
  registerGetUpsellIdentitiesRoutes(app, context0);
  registerGetUpsellIdentitiesOrderIdStagesStageIdSyzepayCheckRoutes(app, context0);
  registerPostUpsellIdentitiesReconcileRoutes(app, context0);
  registerDeleteUpsellsStageIdRoutes(app, context0);
  registerPostMetaPurchasesReconcileRoutes(app, context0);
  registerPostAbTestsRoutes(app, context0);
};

export default plugin;
