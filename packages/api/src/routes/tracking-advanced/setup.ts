import type { FastifyInstance } from 'fastify';
import { registerUpsellOperatorAudit } from '.././upsell-operator-audit.js';

export function registerSetupRoutes(app: FastifyInstance) {
  registerUpsellOperatorAudit(app);
}
