import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { browserPushRoutes } from './browser-push.js';
import { saleNoticePreferenceRoutes } from './sale-notice-preferences.js';
import { registerGetReserveProjection } from './tracking-overview/get-reserve-projection.js';
import { registerGetSaleNoticeStream } from './tracking-overview/get-sale-notice-stream.js';
import { registerGetSaleNotices } from './tracking-overview/get-sale-notices.js';
import { registerGetTrackingOverviewRoutes } from './tracking-overview/get-tracking-overview.js';

const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  await app.register(browserPushRoutes);
  await app.register(saleNoticePreferenceRoutes);
  registerGetSaleNoticeStream(app);
  registerGetSaleNotices(app);
  registerGetReserveProjection(app);
  registerGetTrackingOverviewRoutes(app);
};

export default plugin;
