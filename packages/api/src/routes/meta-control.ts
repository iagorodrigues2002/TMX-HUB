import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { registerTrafficAlerts } from '../services/traffic-notifications.js';
import { registerLocalMetaCampaignRoutes } from './meta-control/get-local-meta-campaigns.js';
import { registerLocalTrafficFinanceRoutes } from './meta-control/get-local-traffic-finance.js';
import { registerGetMetaControlConnectionsRoutes } from './meta-control/get-meta-control-connections.js';
import { registerMetaInventoryRoutes } from './meta-control/get-meta-inventory.js';
import { registerTrafficAttribution } from './meta-control/get-traffic-attribution.js';
import { registerPatchMetaControlConnectionsConnectionIdPushcutRoutes } from './meta-control/patch-meta-control-connections-connection-id-pushcut.js';
import { registerTrafficUserConnection } from './meta-control/traffic-user-connection.js';
import { registerGetTrackingOverviewRoutes } from './tracking-overview/get-tracking-overview.js';

const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  registerGetTrackingOverviewRoutes(app, true);
  registerTrafficAttribution(app);
  registerTrafficAlerts(app);
  registerTrafficUserConnection(app);
  registerGetMetaControlConnectionsRoutes(app);
  registerMetaInventoryRoutes(app);
  registerLocalMetaCampaignRoutes(app);
  registerLocalTrafficFinanceRoutes(app);
  registerPatchMetaControlConnectionsConnectionIdPushcutRoutes(app);
};

export default plugin;
