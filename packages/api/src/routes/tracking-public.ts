import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { createAbRedirectHandlerContext } from './tracking-public/ab-redirect-handler-context.js';
import { registerGetCSlugRoutes } from './tracking-public/get-c-slug.js';
import { registerGetRTestIdRoutes } from './tracking-public/get-r-test-id.js';
import { registerGetWebhooksVendepayRoutes } from './tracking-public/get-webhooks-vendepay.js';
import { registerPostConsentRecordRoutes } from './tracking-public/post-consent-record.js';
import { registerPostTrackBootstrapRoutes } from './tracking-public/post-track-bootstrap.js';
import { registerPostTrackUpsellEventsRoutes } from './tracking-public/post-track-upsell-events.js';
import { registerPostWebhooksRecoveryResendRoutes } from './tracking-public/post-webhooks-recovery-resend.js';
import { registerPostWebhooksVendepayReplayQuarantineRoutes } from './tracking-public/post-webhooks-vendepay-replay-quarantine.js';
import { registerPostWebhooksVendepayRoutes } from './tracking-public/post-webhooks-vendepay.js';
import { createUpsellDestinationForAccountContext } from './tracking-public/upsell-destination-for-account-context.js';
export { extractAttributionQuery, hasCampaignAttribution } from './tracking-public/attribution.js';
export { safeEventSourceUrl, validBrowserEventId } from './tracking-public/browser-request.js';

const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  registerPostConsentRecordRoutes(app);
  const context0 = createUpsellDestinationForAccountContext(app);
  registerPostWebhooksRecoveryResendRoutes(app);
  registerPostTrackBootstrapRoutes(app);
  registerGetCSlugRoutes(app);
  const context1 = createAbRedirectHandlerContext(app);
  registerGetRTestIdRoutes(app, context0, context1);
  registerPostTrackUpsellEventsRoutes(app);
  registerPostWebhooksVendepayRoutes(app);
  registerGetWebhooksVendepayRoutes(app);
  registerPostWebhooksVendepayReplayQuarantineRoutes(app);
};

export default plugin;
