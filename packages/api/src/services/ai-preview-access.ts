import { createHash } from 'node:crypto';
import { hasNavigationAccess } from '@page-cloner/shared';
import { assignedOffer } from '@page-cloner/shared/traffic-campaigns-model';
import type { FastifyInstance } from 'fastify';
import { membershipTools } from '../lib/company-tools.js';
import { HttpProblem } from '../lib/problem.js';
import { type AiData, aiScopeSchema, buildAiContext } from './ai-preview-model.js';

const denied = () =>
  new HttpProblem({
    status: 403,
    title: 'Acesso negado',
    detail: 'Assistente indisponível para estas permissões da empresa.',
  });
export async function aiAccess(app: FastifyInstance, company: string, userId: string) {
  if (!app.db || !app.userStore) throw denied();
  // Read the account and this membership afresh; the session tools union is not authorization.
  const user = await app.userStore.maybeGetById(userId);
  const [member] =
    await app.db`SELECT role,status,tools,all_offers FROM company_memberships WHERE company_id::text=${company} AND user_id=${userId}`;
  if (!user || !member || member.status !== 'active') throw denied();
  const tools = membershipTools(
    { role: member.role, status: member.status, tools: member.tools },
    user.allowedTools,
  );
  if (!tools.includes('nav:ai-assistant')) throw denied();
  const offers =
    await app.db`SELECT o.offer_id FROM company_offers o WHERE o.company_id::text=${company}
    AND (${member.all_offers === true} OR EXISTS(SELECT 1 FROM company_offer_grants g
      WHERE g.company_id=o.company_id AND g.offer_id=o.offer_id AND g.user_id=${userId}))`;
  const offerIds = offers.map((o) => String(o.offer_id)).sort();
  const area = (...ids: string[]) =>
    tools.includes('ofertas') && ids.some((id) => hasNavigationAccess(tools, id));
  const access = {
    companyId: company,
    userId,
    offerIds,
    canManage: user.role === 'admin' && ['owner', 'admin'].includes(member.role),
    allOffers: member.all_offers === true,
    campaigns: area('traffic-overview', 'traffic-campaigns', 'traffic-windows'),
    ads: area('ads-intelligence'),
    sales: area('overview', 'tracking-overview', 'tracking-journey'),
    upsells: area('tracking-upsell-intelligence'),
    reversals: area('refunds'),
    optimizations: area('traffic-campaigns'),
    spy: area('spy-monitor', 'spy-offers'),
  };
  const revision = createHash('sha256')
    .update(JSON.stringify({ ...access, tools: [...tools].sort(), role: member.role }))
    .digest('hex');
  return { ...access, revision };
}
export type AiAccess = Awaited<ReturnType<typeof aiAccess>>;

export function authorizedAiContext(
  raw: AiData & { trafficStale?: boolean },
  input: unknown,
  access: AiAccess,
) {
  if (raw.companyId !== access.companyId) throw denied();
  const scope = aiScopeSchema.parse(input);
  const offers = raw.offers.filter((o) => access.offerIds.includes(o.id));
  const ids = new Set(offers.map((o) => o.id));
  const resolveOffer = (label: string) =>
    raw.classification.links[label] ??
    (raw.offers.filter((o) => o.name.toUpperCase() === label.toUpperCase()).length === 1
      ? raw.offers.find((o) => o.name.toUpperCase() === label.toUpperCase())?.id
      : undefined);
  if (scope.offer && !ids.has(resolveOffer(scope.offer) ?? '')) throw denied();
  const media = access.campaigns || access.ads;
  const campaigns = media
    ? raw.snapshot.campaigns.filter(
        (c) =>
          access.allOffers ||
          ids.has(resolveOffer(assignedOffer(c, raw.classification.campaigns)) ?? ''),
      )
    : [];
  const campaignIds = new Set(campaigns.map((c) => c.id));
  const insights = raw.snapshot.insights.filter((r) => campaignIds.has(r.campaignId));
  const accounts = new Set(campaigns.map((c) => c.accountId));
  const adIds = new Set(insights.map((r) => r.adId));
  const eventAllowed = (e: AiData['optimizations'][number]) =>
    e.level === 'campaigns'
      ? campaignIds.has(e.itemId)
      : insights.some((r) => (e.level === 'ads' ? r.adId === e.itemId : r.adsetId === e.itemId));
  const filtered = {
    ...raw,
    offers,
    snapshot: {
      ...raw.snapshot,
      campaigns,
      insights,
      accounts: raw.snapshot.accounts.filter((a) => accounts.has(a.id)),
      ads: raw.snapshot.ads?.filter((a) => adIds.has(a.id)),
      hourly: raw.snapshot.hourly?.filter((r) => campaignIds.has(r.campaignId)),
      failures: raw.snapshot.failures.filter((f) => accounts.has(f.accountId)),
    },
    classification: {
      campaigns: Object.fromEntries(
        Object.entries(raw.classification.campaigns).filter(([id]) => campaignIds.has(id)),
      ),
      links: Object.fromEntries(
        Object.entries(raw.classification.links).filter(([, id]) => ids.has(id)),
      ),
    },
    sales: raw.sales.filter(
      (s) =>
        ids.has(s.offer_id) &&
        (access.sales || (access.upsells && /^upsell(?:[_\s-]?\d+)?$/i.test(s.order_kind ?? ''))),
    ),
    reversals: access.reversals ? raw.reversals.filter((r) => ids.has(r.offer_id)) : [],
    optimizations: access.optimizations ? raw.optimizations.filter(eventAllowed) : [],
  };
  const result = buildAiContext(filtered, {
    ...scope,
    level: access.campaigns ? scope.level : 'ads',
  });
  if (!media) {
    result.totals = null;
    result.warnings = result.warnings.filter((w) => !/Meta|Histórico cobre alterações/.test(w));
  }
  result.warnings.push(
    'Dados limitados às áreas e ofertas autorizadas do usuário. Ausência de acesso não significa resultado zero.',
  );
  return {
    ...result,
    upsellIntelligence: access.upsells ? raw.upsellIntelligence?.filter(r => ids.has(r.offerId) && result.offers.some(o => o.id === r.offerId)) : undefined,
    learning: access.optimizations && media ? (raw.learning ?? []).filter(l => ids.has(l.offerId) &&
      (!scope.offer || result.offers.some(o => o.id === l.offerId))) : [],
    incomplete: media ? result.incomplete : null,
    metaFetchedAt: media ? result.metaFetchedAt : null,
    permissionNotice:
      'Áreas indisponíveis não foram consultadas por falta de permissão. Isso não indica cobertura incompleta das vendas autorizadas. Não descreva a situação da coleta de uma área sem acesso.',
    availableAreas: {
      media,
      sales: access.sales,
      upsells: access.upsells,
      reversals: access.reversals,
      optimizations: access.optimizations,
    },
  };
}

export function permittedHistory(
  record: { accessRevision?: string; companyId?: string; at: string },
  access: AiAccess,
) {
  const legacyFullAccess =
    !record.accessRevision &&
    access.canManage &&
    access.allOffers &&
    access.campaigns &&
    access.ads &&
    access.sales &&
    access.upsells &&
    access.reversals &&
    access.optimizations;
  return (
    record.companyId === access.companyId &&
    (record.accessRevision === access.revision || legacyFullAccess) &&
    Date.parse(record.at) >= Date.now() - 30 * 86400000
  );
}
