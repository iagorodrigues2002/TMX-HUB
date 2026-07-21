import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { ToolKey } from '@page-cloner/shared';
import { HttpProblem } from '../lib/problem.js';
import activityRoutes from './activity.js';
import authRoutes from './auth.js';
import buildsRoutes from './builds.js';
import clonesRoutes from './clones.js';
import digiAuditsRoutes from './digi-audits.js';
import formsRoutes from './forms.js';
import funnelJobsRoutes from './funnel-jobs.js';
import healthRoutes from './health.js';
import inspectRoutes from './inspect.js';
import linksRoutes from './links.js';
import nichesRoutes from './niches.js';
import offersRoutes from './offers.js';
import pageDiffRoutes from './page-diff.js';
import previewRoutes from './preview.js';
import shieldJobsRoutes from './shield-jobs.js';
import mediaJobsRoutes from './media-jobs.js';
import usersRoutes from './users.js';
import vslJobsRoutes from './vsl-jobs.js';
import webhookTestRoutes from './webhook-test.js';

/**
 * Mapeia prefixos de path (sob /v1) → ToolKey requerida. Paths não listados
 * são considerados "comum a todos" (auth, /me, /activity, etc.) e bypass.
 * Quando user tem `tools` definido no JWT e o tool da rota não está nele,
 * retornamos 403. Admin sempre bypassa.
 */
const TOOL_PATH_MAP: Array<{ prefix: string; tool: ToolKey }> = [
  { prefix: '/v1/niches', tool: 'video-shield' },
  { prefix: '/v1/shield-jobs', tool: 'video-shield' },
  { prefix: '/v1/media-jobs', tool: 'creative-studio' },
  { prefix: '/v1/clones', tool: 'cloner' },
  { prefix: '/v1/forms', tool: 'cloner' },
  { prefix: '/v1/links', tool: 'cloner' },
  { prefix: '/v1/inspect', tool: 'cloner' },
  { prefix: '/v1/vsl-jobs', tool: 'vsl' },
  { prefix: '/v1/funnel-jobs', tool: 'funnel-clone' },
  { prefix: '/v1/page-diff', tool: 'page-diff' },
  { prefix: '/v1/webhook-test', tool: 'webhook-tester' },
  { prefix: '/v1/digi-audits', tool: 'digi-approval' },
  { prefix: '/v1/offers', tool: 'ofertas' },
  { prefix: '/v1/dashboard', tool: 'ofertas' },
];

class ToolForbiddenError extends HttpProblem {
  constructor(tool: ToolKey) {
    super({
      status: 403,
      title: 'Forbidden',
      detail: `Você não tem acesso à ferramenta "${tool}".`,
      code: 'tool_forbidden',
    });
  }
}

const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  // Health endpoints live at root, public.
  await app.register(healthRoutes);

  // /v1 prefix.
  await app.register(
    async (v1) => {
      // Auth endpoints — explicitly public except /me which gates itself.
      await v1.register(authRoutes);

      // Preview is loaded inside an iframe (no Authorization header possible).
      // Stays public; the ULID in the URL is the capability token.
      await v1.register(previewRoutes);

      // Everything below requires a valid JWT.
      await v1.register(async (protectedRoutes) => {
        protectedRoutes.addHook('preHandler', (req) => app.requireAuth(req));
        // Gating por ferramenta: depois da auth, checa allowedTools do user
        // contra o prefixo da rota. Admin/users sem tools bypassam.
        protectedRoutes.addHook('preHandler', async (req) => {
          if (!req.user) return;                       // requireAuth já tratou
          if (req.user.role === 'admin') return;       // admin = todas
          const tools = req.user.tools;
          if (!tools || tools.length === 0) return;    // acesso completo
          const match = TOOL_PATH_MAP.find((m) => req.url.startsWith(m.prefix));
          if (!match) return;                          // rota não restrita
          if (!tools.includes(match.tool)) {
            throw new ToolForbiddenError(match.tool);
          }
        });
        await protectedRoutes.register(activityRoutes);
        await protectedRoutes.register(clonesRoutes);
        await protectedRoutes.register(inspectRoutes);
        await protectedRoutes.register(formsRoutes);
        await protectedRoutes.register(linksRoutes);
        await protectedRoutes.register(buildsRoutes);
        await protectedRoutes.register(vslJobsRoutes);
        await protectedRoutes.register(webhookTestRoutes);
        await protectedRoutes.register(pageDiffRoutes);
        await protectedRoutes.register(funnelJobsRoutes);
        await protectedRoutes.register(offersRoutes);
        await protectedRoutes.register(nichesRoutes);
        await protectedRoutes.register(shieldJobsRoutes);
        await protectedRoutes.register(mediaJobsRoutes);
        await protectedRoutes.register(digiAuditsRoutes);
        await protectedRoutes.register(usersRoutes);
      });
    },
    { prefix: '/v1' },
  );
};

export default plugin;
