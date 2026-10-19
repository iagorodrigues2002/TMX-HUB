import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { registerGetMetaControlConnectionsRoutes } from './meta-control/get-meta-control-connections.js';
import { registerPatchMetaControlConnectionsConnectionIdPushcutRoutes } from './meta-control/patch-meta-control-connections-connection-id-pushcut.js';

const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  registerGetMetaControlConnectionsRoutes(app);
  registerPatchMetaControlConnectionsConnectionIdPushcutRoutes(app);
};

export default plugin;
