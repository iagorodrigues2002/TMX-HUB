import {
  CreateOfferRequestSchema,
  type DailySnapshot,
  IngestSnapshotsRequestSchema,
  UpdateOfferRequestSchema,
} from '@page-cloner/shared';
import type { Offer } from '@page-cloner/shared';
import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { BadRequestError, HttpProblem, zodToProblem } from '../lib/problem.js';
import {
  DEFAULT_AI_ROLE,
  DEFAULT_AI_TEMPLATE,
  generateCampaignAnalysis,
  OPENCODE_MODELS,
} from '../services/campaign-ai.js';
import { computeMetrics } from '../services/snapshot-store.js';

function offerToWire(o: Offer, includeAccess = false): Record<string, unknown> {
  return {
    id: o.id,
    name: o.name,
    company_name: o.companyName,
    dashboard_id: o.dashboardId,
    currency: o.currency ?? 'BRL',
    utmify_configured: Boolean(o.utmifyConfigured),
    utmify_login_hint: o.utmifyLoginHint,
    sync_status: o.syncStatus ?? 'idle',
    last_sync_at: o.lastSyncAt,
    last_sync_error: o.lastSyncError,
    description: o.description,
    status: o.status,
    created_at: o.createdAt,
    updated_at: o.updatedAt,
    ...(includeAccess ? { member_ids: o.memberIds ?? [] } : {}),
  };
}

async function validateMemberIds(
  app: FastifyInstance,
  memberIds: string[] | undefined,
  ownerId: string,
): Promise<string[] | undefined> {
  if (memberIds === undefined) return undefined;
  const unique = [...new Set(memberIds)].filter((id) => id !== ownerId);
  for (const id of unique) {
    const member = await app.userStore.maybeGetById(id);
    if (!member || member.role === 'admin') {
      throw new BadRequestError(`Membro inválido para a oferta: ${id}`);
    }
    if (member.allowedTools && !member.allowedTools.includes('ofertas')) {
      await app.userStore.update(member.id, {
        allowedTools: [...member.allowedTools, 'ofertas'],
      });
    }
  }
  return unique;
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoNDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

const RangeQuerySchema = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

const AiConfigSchema = z
  .object({
    api_key: z.string().trim().min(8).max(500).optional(),
    provider: z.literal('opencode-go').default('opencode-go'),
    model: z.enum([
      'deepseek-v4-flash',
      'deepseek-v4-pro',
      'kimi-k2.6',
      'kimi-k2.7-code',
      'kimi-k3',
      'glm-5.2',
      'grok-4.5',
      'mimo-v2.5',
    ]),
    role: z.string().trim().min(20).max(4_000),
    template: z.string().trim().min(50).max(12_000),
    responsible: z.string().trim().max(100).default(''),
    min_roas: z.number().min(0).max(100).default(0),
    tone: z.enum(['direto', 'conservador', 'detalhado']).default('direto'),
    include_ads: z.boolean().default(true),
    auto_generate: z.boolean().default(false),
    schedule_hours: z.array(z.number().int().min(0).max(23)).max(24).default([]),
  })
  .strict();

const AiFeedbackSchema = z
  .object({
    feedback: z.string().trim().max(1_000),
  })
  .strict();

export function canUseOfferAi(role: 'admin' | 'user', tools?: string[]): boolean {
  return role === 'admin' || Boolean(tools?.includes('ofertas-ia'));
}

function assertAiAccess(user: NonNullable<FastifyRequest['user']>): void {
  if (canUseOfferAi(user.role, user.tools)) return;
  throw new HttpProblem({
    status: 403,
    title: 'Forbidden',
    detail: 'Sua conta não tem permissão para usar a IA de Ofertas.',
    code: 'offer_ai_forbidden',
  });
}

function resolveRange(q: { from?: string; to?: string }): { from: string; to: string } {
  // Default: last 7 days inclusive (today minus 6).
  const to = q.to ?? isoToday();
  const from = q.from ?? isoNDaysAgo(6);
  return { from, to };
}

const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  // GET /v1/offers — list all offers belonging to the caller
  app.get('/offers', async (req, reply) => {
    if (!req.user) throw new BadRequestError('No user attached.');
    const offers = await app.offerStore.listAccessible(req.user.sub, req.user.role === 'admin');
    const includeAccess = req.user.role === 'admin';
    return reply.send({ offers: offers.map((offer) => offerToWire(offer, includeAccess)) });
  });

  // POST /v1/offers — create a new offer
  app.post('/offers', async (req, reply) => {
    if (!req.user) throw new BadRequestError('No user attached.');
    if (req.user.role !== 'admin') {
      throw new HttpProblem({
        status: 403,
        title: 'Forbidden',
        detail: 'Apenas administradores podem criar ofertas.',
        code: 'forbidden',
      });
    }
    const parsed = CreateOfferRequestSchema.safeParse(req.body);
    if (!parsed.success) throw zodToProblem(parsed.error, req.url);
    const memberIds = await validateMemberIds(app, parsed.data.member_ids, req.user.sub);
    const offer = await app.offerStore.create({
      userId: req.user.sub,
      name: parsed.data.name,
      ...(parsed.data.company_name ? { companyName: parsed.data.company_name } : {}),
      ...(parsed.data.dashboard_id ? { dashboardId: parsed.data.dashboard_id } : {}),
      ...(parsed.data.description ? { description: parsed.data.description } : {}),
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
      ...(memberIds ? { memberIds } : {}),
    });
    if (parsed.data.utmify_login && parsed.data.utmify_password) {
      await app.offerStore.setUtmifyCredentials(offer.id, {
        login: parsed.data.utmify_login,
        password: parsed.data.utmify_password,
      });
      const connected = await app.offerStore.get(offer.id);
      void app.utmifySync.syncOffer(connected, true).catch((error) => {
        app.log.warn({ error, offerId: offer.id }, 'initial utmify sync failed');
      });
      return reply.code(201).send(offerToWire(connected, true));
    }
    return reply.code(201).send(offerToWire(offer, true));
  });

  // PATCH /v1/offers/:id — update name/status/links/etc
  app.patch<{ Params: { id: string } }>('/offers/:id', async (req, reply) => {
    if (!req.user) throw new BadRequestError('No user attached.');
    const parsed = UpdateOfferRequestSchema.safeParse(req.body);
    if (!parsed.success) throw zodToProblem(parsed.error, req.url);
    const current = await app.offerStore.assertManager(
      req.params.id,
      req.user.sub,
      req.user.role === 'admin',
    );
    const memberIds = await validateMemberIds(app, parsed.data.member_ids, current.userId);
    const updated = await app.offerStore.update(req.params.id, current.userId, {
      ...parsed.data,
      ...(memberIds !== undefined ? { member_ids: memberIds } : {}),
    });
    if (parsed.data.utmify_login && parsed.data.utmify_password) {
      await app.offerStore.setUtmifyCredentials(updated.id, {
        login: parsed.data.utmify_login,
        password: parsed.data.utmify_password,
      });
    }
    const finalOffer = await app.offerStore.get(updated.id);
    if (
      finalOffer.utmifyConfigured &&
      finalOffer.dashboardId &&
      (parsed.data.dashboard_id || parsed.data.utmify_login)
    ) {
      void app.utmifySync.syncOffer(finalOffer, true).catch((error) => {
        app.log.warn({ error, offerId: finalOffer.id }, 'utmify reconnect sync failed');
      });
    }
    return reply.send(offerToWire(finalOffer, true));
  });

  // DELETE /v1/offers/:id
  app.delete<{ Params: { id: string } }>('/offers/:id', async (req, reply) => {
    if (!req.user) throw new BadRequestError('No user attached.');
    const offer = await app.offerStore.assertManager(
      req.params.id,
      req.user.sub,
      req.user.role === 'admin',
    );
    await app.snapshotStore.deleteAllForOffer(req.params.id);
    await app.intradayStore.deleteAllForOffer(req.params.id);
    await app.offerStore.delete(req.params.id, offer.userId);
    return reply.code(204).send();
  });

  // POST /v1/offers/:id/ingest — accept daily snapshots from n8n / external sources
  app.post<{ Params: { id: string } }>('/offers/:id/ingest', async (req, reply) => {
    if (!req.user) throw new BadRequestError('No user attached.');
    await app.offerStore.assertManager(req.params.id, req.user.sub, req.user.role === 'admin');
    const parsed = IngestSnapshotsRequestSchema.safeParse(req.body);
    if (!parsed.success) throw zodToProblem(parsed.error, req.url);

    const now = new Date().toISOString();
    const upserted: DailySnapshot[] = [];
    for (const s of parsed.data.snapshots) {
      const snap: DailySnapshot = {
        offerId: req.params.id,
        date: s.date,
        spend: s.spend,
        sales: s.sales,
        revenue: s.revenue,
        ic: s.ic,
        ...(s.impressions !== undefined ? { impressions: s.impressions } : {}),
        ...(s.clicks !== undefined ? { clicks: s.clicks } : {}),
        ...(s.adsets ? { adsets: s.adsets } : {}),
        ...(s.ads ? { ads: s.ads } : {}),
        updatedAt: now,
      };
      await app.snapshotStore.upsert(snap);
      upserted.push(snap);
    }
    return reply.send({
      offer_id: req.params.id,
      ingested: upserted.length,
      dates: upserted.map((s) => s.date),
    });
  });

  // GET /v1/offers/:id/snapshots?from=&to= — daily series + aggregated totals
  app.get<{ Params: { id: string }; Querystring: { from?: string; to?: string } }>(
    '/offers/:id/snapshots',
    async (req, reply) => {
      if (!req.user) throw new BadRequestError('No user attached.');
      const offer = await app.offerStore.assertAccess(
        req.params.id,
        req.user.sub,
        req.user.role === 'admin',
      );
      const range = resolveRange(RangeQuerySchema.parse(req.query));
      const snapshots = await app.snapshotStore.listRange(offer.id, range.from, range.to);
      const totals = app.snapshotStore.aggregate(snapshots);
      return reply.send({
        offer: offerToWire(offer, req.user.role === 'admin'),
        from: range.from,
        to: range.to,
        snapshots: snapshots.map(snapshotToWire),
        totals,
      });
    },
  );

  app.post<{ Params: { id: string } }>('/offers/:id/sync', async (req, reply) => {
    if (!req.user) throw new BadRequestError('No user attached.');
    const offer = await app.offerStore.assertManager(
      req.params.id,
      req.user.sub,
      req.user.role === 'admin',
    );
    // A sync acionada pelo operador reconstrói todo o histórico recente. A
    // rotina automática continua incremental para não sobrecarregar a UTMify.
    const result = await app.utmifySync.syncOffer(offer, true);
    return reply.send(result);
  });

  // GET /v1/offers/:id/utmify-capabilities — inspect the real response schema
  // without returning credentials, tokens, or the complete ads payload.
  app.get<{ Params: { id: string } }>('/offers/:id/utmify-capabilities', async (req, reply) => {
    if (!req.user) throw new BadRequestError('No user attached.');
    const offer = await app.offerStore.assertManager(
      req.params.id,
      req.user.sub,
      req.user.role === 'admin',
    );
    return reply.send(await app.utmifySync.inspectCapabilities(offer));
  });

  app.get<{ Params: { id: string } }>('/offers/:id/intraday', async (req, reply) => {
    if (!req.user) throw new BadRequestError('No user attached.');
    const offer = await app.offerStore.assertAccess(
      req.params.id,
      req.user.sub,
      req.user.role === 'admin',
    );
    return reply.send(await app.intradayStore.summary(offer.id));
  });

  app.get<{ Params: { id: string } }>('/offers/:id/ai-config', async (req, reply) => {
    if (!req.user) throw new BadRequestError('No user attached.');
    assertAiAccess(req.user);
    await app.offerStore.assertAccess(req.params.id, req.user.sub, req.user.role === 'admin');
    const config = await app.offerStore.getAiConfig(req.params.id);
    const canManage = req.user.role === 'admin';
    return reply.send({
      config: config
        ? {
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

  app.post<{ Params: { id: string } }>('/offers/:id/ai-analysis', async (req, reply) => {
    if (!req.user) throw new BadRequestError('No user attached.');
    assertAiAccess(req.user);
    const offer = await app.offerStore.assertAccess(
      req.params.id,
      req.user.sub,
      req.user.role === 'admin',
    );
    const config = await app.offerStore.getAiSecretConfig(offer.id);
    if (!config) {
      throw new BadRequestError('Configure a chave e o modelo da IA antes de gerar a análise.');
    }
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

  app.patch<{ Params: { id: string; analysisId: string } }>(
    '/offers/:id/ai-analyses/:analysisId/feedback',
    async (req, reply) => {
      if (!req.user) throw new BadRequestError('No user attached.');
      assertAiAccess(req.user);
      if (req.user.role !== 'admin') {
        throw new HttpProblem({
          status: 403,
          title: 'Forbidden',
          detail: 'Apenas administradores podem registrar feedback para a IA.',
          code: 'admin_required',
        });
      }
      await app.offerStore.assertAccess(req.params.id, req.user.sub, true);
      const parsed = AiFeedbackSchema.safeParse(req.body);
      if (!parsed.success) throw zodToProblem(parsed.error);
      return reply.send(
        await app.offerStore.setAiAnalysisFeedback(
          req.params.id,
          req.params.analysisId,
          parsed.data.feedback,
        ),
      );
    },
  );

  // GET /v1/dashboard/summary?from=&to= — cross-offer aggregation for the home
  app.get<{ Querystring: { from?: string; to?: string } }>(
    '/dashboard/summary',
    async (req, reply) => {
      if (!req.user) throw new BadRequestError('No user attached.');
      const range = resolveRange(RangeQuerySchema.parse(req.query));
      const offers = await app.offerStore.listAccessible(req.user.sub, req.user.role === 'admin');
      const perOffer: Array<{
        offer: Record<string, unknown>;
        totals: ReturnType<typeof computeMetrics>;
        snapshots_count: number;
      }> = [];
      let spend = 0;
      let sales = 0;
      let revenue = 0;
      let ic = 0;
      const byCurrency = new Map<
        string,
        { spend: number; sales: number; revenue: number; ic: number }
      >();
      for (const offer of offers) {
        const snaps = await app.snapshotStore.listRange(offer.id, range.from, range.to);
        const totals = app.snapshotStore.aggregate(snaps);
        spend += totals.spend;
        sales += totals.sales;
        revenue += totals.revenue;
        ic += totals.ic;
        const currency = offer.currency ?? 'BRL';
        const currencyTotals = byCurrency.get(currency) ?? {
          spend: 0,
          sales: 0,
          revenue: 0,
          ic: 0,
        };
        currencyTotals.spend += totals.spend;
        currencyTotals.sales += totals.sales;
        currencyTotals.revenue += totals.revenue;
        currencyTotals.ic += totals.ic;
        byCurrency.set(currency, currencyTotals);
        perOffer.push({
          offer: offerToWire(offer, req.user.role === 'admin'),
          totals,
          snapshots_count: snaps.length,
        });
      }
      return reply.send({
        from: range.from,
        to: range.to,
        totals: computeMetrics({ spend, sales, revenue, ic }),
        currency_totals: [...byCurrency.entries()].map(([currency, values]) => ({
          currency,
          totals: computeMetrics(values),
        })),
        offers: perOffer,
      });
    },
  );
};

function snapshotToWire(s: DailySnapshot): Record<string, unknown> {
  return {
    date: s.date,
    spend: s.spend,
    sales: s.sales,
    revenue: s.revenue,
    ic: s.ic,
    impressions: s.impressions,
    clicks: s.clicks,
    adsets: s.adsets,
    ads: s.ads,
    metrics: computeMetrics({ spend: s.spend, sales: s.sales, revenue: s.revenue, ic: s.ic }),
    updated_at: s.updatedAt,
  };
}

export default plugin;
