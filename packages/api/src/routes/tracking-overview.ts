import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { registerGetSaleNoticeStream } from './tracking-overview/get-sale-notice-stream.js';
import { registerGetSaleNotices } from './tracking-overview/get-sale-notices.js';
import { registerGetTrackingOverviewRoutes } from './tracking-overview/get-tracking-overview.js';

const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  registerGetSaleNoticeStream(app);
  registerGetSaleNotices(app);
  registerGetTrackingOverviewRoutes(app);
};

export default plugin;
