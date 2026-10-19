import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { createGetDestinationConnectionContext } from './google-ads-oauth/get-destination-connection-context.js';
import { registerGetGoogleAdsConnectionStatusRoutes } from './google-ads-oauth/get-google-ads-connection-status.js';
import { registerGetOauthAccountsRoutes } from './google-ads-oauth/get-oauth-accounts.js';
import { registerPostOauthTestSyntheticRoutes } from './google-ads-oauth/post-oauth-test-synthetic.js';

const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  const context0 = createGetDestinationConnectionContext(app);
  registerGetGoogleAdsConnectionStatusRoutes(app);
  registerGetOauthAccountsRoutes(app, context0);
  registerPostOauthTestSyntheticRoutes(app, context0);
};

export default plugin;
