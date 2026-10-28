import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { browserPushRoutes } from './browser-push.js';
import { registerGetSaleNoticeStream } from './tracking-overview/get-sale-notice-stream.js';
import { registerGetSaleNotices } from './tracking-overview/get-sale-notices.js';
import { registerGetTrackingOverviewRoutes } from './tracking-overview/get-tracking-overview.js';

const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  await app.register(browserPushRoutes);
  registerGetSaleNoticeStream(app);
  registerGetSaleNotices(app);
  registerGetTrackingOverviewRoutes(app);
};

export default plugin;
