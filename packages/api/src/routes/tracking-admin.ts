import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { registerGetAttributionRoutes } from './tracking-admin/get-attribution.js';
import { registerGetCountriesRoutes } from './tracking-admin/get-countries.js';
import { registerGetDiagnosticsRoutes } from './tracking-admin/get-diagnostics.js';
import { registerGetHealthRoutes } from './tracking-admin/get-health.js';
import { registerGetPageFunnelRoutes } from './tracking-admin/get-page-funnel.js';
import { registerGetReceiptRevenueRoutes } from './tracking-admin/get-receipt-revenue.js';
import { registerGetSummaryRoutes } from './tracking-admin/get-summary.js';
import { registerGetTrackingRoutes } from './tracking-admin/get-tracking.js';
import { registerPatchVendepayConnectionsConnectionIdRoutes } from './tracking-admin/patch-vendepay-connections-connection-id.js';
import { registerPostInitiateCheckoutReconcileRoutes } from './tracking-admin/post-initiate-checkout-reconcile.js';
import { registerPostOrdersBackfillCurrencyRoutes } from './tracking-admin/post-orders-backfill-currency.js';
import { registerPutGatewayConnectionsConnectionIdFeesRoutes } from './tracking-admin/put-gateway-connections-connection-id-fees.js';
import { registerPutUtmifyPixelRoutes } from './tracking-admin/put-utmify-pixel.js';

const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  registerGetHealthRoutes(app);
  registerPutUtmifyPixelRoutes(app);
  registerPostInitiateCheckoutReconcileRoutes(app);
  registerGetDiagnosticsRoutes(app);
  registerGetTrackingRoutes(app);
  registerPatchVendepayConnectionsConnectionIdRoutes(app);
  registerGetPageFunnelRoutes(app);
  registerGetCountriesRoutes(app);
  registerGetReceiptRevenueRoutes(app);
  registerGetAttributionRoutes(app);
  registerGetSummaryRoutes(app);
  registerPutGatewayConnectionsConnectionIdFeesRoutes(app);
  registerPostOrdersBackfillCurrencyRoutes(app);
};

export default plugin;
