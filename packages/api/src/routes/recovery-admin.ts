import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { registerGetRecoveryRoutes } from './recovery-admin/get-recovery.js';
import { registerPostRecoveryOpportunitiesOpportunityIdSendRoutes } from './recovery-admin/post-recovery-opportunities-opportunity-id-send.js';
import { registerPostRecoveryTestEmailRoutes } from './recovery-admin/post-recovery-test-email.js';
import { createProjectForContext } from './recovery-admin/project-for-context.js';

const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  const context0 = createProjectForContext(app);
  registerGetRecoveryRoutes(app, context0);
  registerPostRecoveryTestEmailRoutes(app, context0);
  registerPostRecoveryOpportunitiesOpportunityIdSendRoutes(app, context0);
};

export default plugin;
