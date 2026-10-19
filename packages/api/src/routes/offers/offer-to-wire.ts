import type { DailySnapshot, Offer } from '@page-cloner/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { BadRequestError, HttpProblem } from '../../lib/problem.js';
import { canConfigureTrackingOffer } from '../../services/offer-store.js';
import { computeMetrics } from '../../services/snapshot-store.js';

export function offerToWire(
  o: Offer,
  options: {
    includeAccess?: boolean;
    canManage?: boolean;
    userId?: string;
    isAdmin?: boolean;
  } = {},
): Record<string, unknown> {
  return {
    id: o.id,
    name: o.name,
    company_name: o.companyName,
    dashboard_id: o.dashboardId,
    currency: o.currency ?? 'BRL',
    utmify_configured: Boolean(o.utmifyConfigured),
    utmify_access_enabled: o.utmifyAccessEnabled ?? Boolean(o.utmifyConfigured),
    utmify_login_hint: o.utmifyLoginHint,
    sync_status: o.syncStatus ?? 'idle',
    last_sync_at: o.lastSyncAt,
    last_sync_error: o.lastSyncError,
    description: o.description,
    status: o.status,
    created_at: o.createdAt,
    updated_at: o.updatedAt,
    ...(options.includeAccess ? { member_ids: o.memberIds ?? [] } : {}),
    // This is deliberately computed server-side. The web app uses it only to
    // expose management controls; every write still re-checks assertManager.
    can_manage: Boolean(options.canManage),
    can_configure_tracking: canConfigureTrackingOffer(
      o,
      options.userId ?? o.userId,
      options.isAdmin ?? false,
    ),
  };
}

export async function validateMemberIds(
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
      app.invalidateAuthUser(member.id);
    }
  }
  return unique;
}

export function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isoNDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export const RangeQuerySchema = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export const IntradayQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export const AiConfigSchema = z
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

export const AiFeedbackSchema = z
  .object({
    feedback: z.string().trim().max(1_000),
  })
  .strict();

export const AiPreferencesSchema = z
  .object({
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
    responsible: z.string().trim().max(100),
  })
  .strict();

export function canUseOfferAi(role: 'admin' | 'user', tools?: string[]): boolean {
  return role === 'admin' || Boolean(tools?.includes('ofertas-ia'));
}

export function assertAiAccess(user: NonNullable<FastifyRequest['user']>): void {
  if (canUseOfferAi(user.role, user.tools)) return;
  throw new HttpProblem({
    status: 403,
    title: 'Forbidden',
    detail: 'Sua conta não tem permissão para usar a IA de Ofertas.',
    code: 'offer_ai_forbidden',
  });
}

export function resolveRange(q: { from?: string; to?: string }): { from: string; to: string } {
  // Default: last 7 days inclusive (today minus 6).
  const to = q.to ?? isoToday();
  const from = q.from ?? isoNDaysAgo(6);
  return { from, to };
}

export function snapshotToWire(s: DailySnapshot): Record<string, unknown> {
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
