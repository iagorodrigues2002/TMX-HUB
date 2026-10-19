import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { registerGetIntradayRangeRoutes } from './offers/get-intraday-range.js';
import { registerGetOffersRoutes } from './offers/get-offers.js';
import { registerPatchAiAnalysesAnalysisIdFeedbackRoutes } from './offers/patch-ai-analyses-analysis-id-feedback.js';
export { canUseOfferAi } from './offers/offer-to-wire.js';

const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  registerGetOffersRoutes(app);
  registerGetIntradayRangeRoutes(app);
  registerPatchAiAnalysesAnalysisIdFeedbackRoutes(app);
};

export default plugin;
