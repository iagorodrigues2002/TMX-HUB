import type { FastifyInstance } from 'fastify';
import { BadRequestError, HttpProblem, zodToProblem } from '../../lib/problem.js';
import {
  DEFAULT_AI_ROLE,
  DEFAULT_AI_TEMPLATE,
  OPENCODE_MODELS,
  generateCampaignAnalysis,
} from '../../services/campaign-ai.js';
import {
  AiConfigSchema,
  AiPreferencesSchema,
  RangeQuerySchema,
  assertAiAccess,
  isoToday,
  resolveRange,
} from './offer-to-wire.js';

export function registerGetIntradayRangeRoutes(app: FastifyInstance) {
  // Same 12 fixed 2h windows as /intraday, but summed across a date range
  // instead of a single day (raw checkpoints don't survive past days, so
  // this sums each day's already-archived summary and recomputes ratios).
  app.get<{ Params: { id: string }; Querystring: { from?: string; to?: string } }>(
    '/offers/:id/intraday/range',
    async (req, reply) => {
      if (!req.user) throw new BadRequestError('No user attached.');
      const parsed = RangeQuerySchema.safeParse(req.query);
      if (!parsed.success) throw zodToProblem(parsed.error, req.url);
      const offer = await app.offerStore.assertAccess(
        req.params.id,
        req.user.sub,
        req.user.role === 'admin',
      );
      const { from, to } = resolveRange(parsed.data);
      if (from > to) {
        throw new HttpProblem({
          status: 400,
          title: 'Bad Request',
          detail: '"from" precisa ser antes ou igual a "to".',
          code: 'invalid_range',
        });
      }
      if (to > isoToday()) {
        throw new HttpProblem({
          status: 400,
          title: 'Bad Request',
          detail: '"to" não pode estar no futuro.',
          code: 'date_in_future',
        });
      }
      const MAX_RANGE_DAYS = 60;
      const spanDays = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
      if (spanDays > MAX_RANGE_DAYS) {
        throw new HttpProblem({
          status: 400,
          title: 'Bad Request',
          detail: `O período não pode passar de ${MAX_RANGE_DAYS} dias.`,
          code: 'range_too_large',
        });
      }
      return reply.send(await app.intradayStore.summaryRange(offer.id, new Date(), from, to));
    },
  );

  app.get<{ Params: { id: string } }>('/offers/:id/ai-config', async (req, reply) => {
    if (!req.user) throw new BadRequestError('No user attached.');
    assertAiAccess(req.user);
    await app.offerStore.assertAccess(req.params.id, req.user.sub, req.user.role === 'admin');
    const config = await app.offerStore.getAiConfig(req.params.id);
    const preferences =
      req.user.role === 'admin'
        ? null
        : await app.offerStore.getAiUserPreferences(req.params.id, req.user.sub);
    const canManage = req.user.role === 'admin';
    return reply.send({
      config: config
        ? {
            provider: config.provider,
            model: preferences?.model ?? config.model,
            role: config.role,
            template: config.template,
            responsible: preferences?.responsible ?? config.responsible,
            min_roas: config.minRoas,
            tone: config.tone,
            include_ads: config.includeAds,
            auto_generate: config.autoGenerate,
            schedule_hours: config.scheduleHours,
            api_key_configured: config.apiKeyConfigured,
            ...(canManage && config.apiKeyHint ? { api_key_hint: config.apiKeyHint } : {}),
          }
        : {
            provider: 'opencode-go',
            model: 'deepseek-v4-flash',
            role: DEFAULT_AI_ROLE,
            template: DEFAULT_AI_TEMPLATE,
            responsible: '',
            min_roas: 0,
            tone: 'direto',
            include_ads: true,
            auto_generate: false,
            schedule_hours: [10, 14, 18, 22],
            api_key_configured: false,
          },
      models: OPENCODE_MODELS,
      can_manage: canManage,
      can_customize: true,
    });
  });

  app.put<{ Params: { id: string } }>('/offers/:id/ai-config', async (req, reply) => {
    if (!req.user) throw new BadRequestError('No user attached.');
    assertAiAccess(req.user);
    await app.offerStore.assertManager(req.params.id, req.user.sub, req.user.role === 'admin');
    const parsed = AiConfigSchema.safeParse(req.body);
    if (!parsed.success) throw zodToProblem(parsed.error, req.url);
    const config = await app.offerStore.setAiConfig(req.params.id, {
      ...(parsed.data.api_key ? { apiKey: parsed.data.api_key } : {}),
      provider: parsed.data.provider,
      model: parsed.data.model,
      role: parsed.data.role,
      template: parsed.data.template,
      responsible: parsed.data.responsible,
      minRoas: parsed.data.min_roas,
      tone: parsed.data.tone,
      includeAds: parsed.data.include_ads,
      autoGenerate: parsed.data.auto_generate,
      scheduleHours: [...new Set(parsed.data.schedule_hours)].sort((a, b) => a - b),
    });
    return reply.send({
      provider: config.provider,
      model: config.model,
      role: config.role,
      template: config.template,
      responsible: config.responsible,
      min_roas: config.minRoas,
      tone: config.tone,
      include_ads: config.includeAds,
      auto_generate: config.autoGenerate,
      schedule_hours: config.scheduleHours,
      api_key_configured: true,
      api_key_hint: config.apiKeyHint,
    });
  });

  app.patch<{ Params: { id: string } }>('/offers/:id/ai-preferences', async (req, reply) => {
    if (!req.user) throw new BadRequestError('No user attached.');
    assertAiAccess(req.user);
    await app.offerStore.assertAccess(req.params.id, req.user.sub, req.user.role === 'admin');
    const parsed = AiPreferencesSchema.safeParse(req.body);
    if (!parsed.success) throw zodToProblem(parsed.error, req.url);
    if (req.user.role === 'admin') {
      throw new BadRequestError('Administradores devem salvar essas opções na configuração geral.');
    }
    return reply.send(
      await app.offerStore.setAiUserPreferences(req.params.id, req.user.sub, parsed.data),
    );
  });

  app.post<{ Params: { id: string } }>('/offers/:id/ai-analysis', async (req, reply) => {
    if (!req.user) throw new BadRequestError('No user attached.');
    assertAiAccess(req.user);
    const offer = await app.offerStore.assertAccess(
      req.params.id,
      req.user.sub,
      req.user.role === 'admin',
    );
    const baseConfig = await app.offerStore.getAiSecretConfig(offer.id);
    if (!baseConfig) {
      throw new BadRequestError('Configure a chave e o modelo da IA antes de gerar a análise.');
    }
    const preferences =
      req.user.role === 'admin'
        ? null
        : await app.offerStore.getAiUserPreferences(offer.id, req.user.sub);
    const config = preferences ? { ...baseConfig, ...preferences } : baseConfig;
    const lockKey = `lock:offer-ai-analysis:${offer.id}`;
    const statusKey = `offer-ai-analysis-status:${offer.id}`;
    const lock = await app.redis.set(lockKey, req.user.sub, 'EX', 180, 'NX');
    if (!lock) {
      throw new HttpProblem({
        status: 429,
        title: 'Too Many Requests',
        detail: 'Já existe uma análise sendo gerada. Aguarde alguns instantes.',
        code: 'ai_analysis_in_progress',
      });
    }
    const startedAt = new Date().toISOString();
    await app.redis.set(
      statusKey,
      JSON.stringify({ status: 'processing', startedAt }),
      'EX',
      10 * 60,
    );

    void (async () => {
      try {
        const summary = await app.intradayStore.summary(offer.id);
        const history = await app.offerStore.listAiAnalyses(offer.id);
        const analysis = await generateCampaignAnalysis({ offer, summary, config, history });
        await app.offerStore.addAiAnalysis(analysis);
        await app.redis.set(
          statusKey,
          JSON.stringify({
            status: 'success',
            startedAt,
            finishedAt: new Date().toISOString(),
            analysisId: analysis.id,
          }),
          'EX',
          10 * 60,
        );
      } catch (error) {
        app.log.error({ err: error, offerId: offer.id }, 'AI analysis generation failed');
        await app.redis.set(
          statusKey,
          JSON.stringify({
            status: 'error',
            startedAt,
            finishedAt: new Date().toISOString(),
            error: error instanceof Error ? error.message : 'Falha ao gerar análise.',
          }),
          'EX',
          10 * 60,
        );
      } finally {
        await app.redis.del(lockKey);
      }
    })();

    return reply.code(202).send({ accepted: true, status: 'processing', startedAt });
  });

  app.get<{ Params: { id: string } }>('/offers/:id/ai-analysis-status', async (req, reply) => {
    if (!req.user) throw new BadRequestError('No user attached.');
    assertAiAccess(req.user);
    await app.offerStore.assertAccess(req.params.id, req.user.sub, req.user.role === 'admin');
    const raw = await app.redis.get(`offer-ai-analysis-status:${req.params.id}`);
    if (!raw) return reply.send({ status: 'idle' });
    try {
      return reply.send(JSON.parse(raw));
    } catch {
      return reply.send({ status: 'idle' });
    }
  });

  app.get<{ Params: { id: string } }>('/offers/:id/ai-analyses', async (req, reply) => {
    if (!req.user) throw new BadRequestError('No user attached.');
    assertAiAccess(req.user);
    await app.offerStore.assertAccess(req.params.id, req.user.sub, req.user.role === 'admin');
    return reply.send({ analyses: await app.offerStore.listAiAnalyses(req.params.id) });
  });
}
