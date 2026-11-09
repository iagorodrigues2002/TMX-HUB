import type { DateRange } from '@/lib/date-range';
import { type ReportMetrics, type ReportRow, reportMetrics } from './traffic-reports-model';

export interface RealCampaignSnapshot {
  fetchedAt: string;
  attribution?: 'adset';
  from: string;
  to: string;
  purchaseClassification?: 'front_only_user_confirmed';
  fx?: {
    base: 'USD';
    provider: string;
    fetchedAt: string;
    rates: Record<string, Record<string, number>>;
  };
  hourly?: RealCampaignSnapshot['insights'];
  hourlyFailures?: string[];
  ads?: { id: string; status: string }[];
  accounts: {
    id: string;
    name: string;
    businessId: string | null;
    businessName: string | null;
    currency: string | null;
    timezone: string | null;
  }[];
  campaigns: {
    id: string;
    name: string;
    accountId: string;
    status: string;
    effectiveStatus: string;
    objective: string;
    createdAt: string | null;
    updatedAt: string | null;
  }[];
  insights: {
    campaignId: string;
    accountId: string;
    date: string;
    currency: string;
    spend: string;
    impressions: string | null;
    linkClicks: string | null;
    actions: { action_type: string; value: string }[];
    actionValues?: { action_type: string; value: string }[] | null;
    adsetId?: string;
    adsetName?: string;
    adId?: string;
    adName?: string;
    video?: boolean | null;
    hour?: number;
  }[];
  failures: { accountId: string; stage: 'campaigns' | 'insights'; code: number | null }[];
}
export const campaignStatusLabel = (value: string) =>
  ({
    ACTIVE: 'Ativa',
    PAUSED: 'Pausada',
    ARCHIVED: 'Arquivada',
    DELETED: 'Excluída',
    WITH_ISSUES: 'Com problemas',
    IN_PROCESS: 'Em processamento',
    UNKNOWN: 'Não informado',
    DISAPPROVED: 'Reprovado',
    PENDING_REVIEW: 'Em análise',
    ADSET_PAUSED: 'Conjunto pausado',
    CAMPAIGN_PAUSED: 'Campanha pausada',
  })[value] ?? value;

export function campaignOffer(name: string): string {
  const matches = [
    ...name
      .toUpperCase()
      .matchAll(
        /(?:^|[\s\[|\-])([A-Z]{2,10}_(?:ENG|ESP|DE|GER|FR|ITA|PT|BR|EN|ES|IT|NL|PL))(?=$|[_\s\]|\-])/g,
      ),
  ].map((match) => match[1]!);
  const simple = name.toUpperCase().match(/^\[?(CPJRS|PJRN)(?=$|[_\s\]|\-])/);
  const unique = [...new Set([...matches, ...(simple ? [simple[1]!] : [])])];
  return unique.length === 1 ? unique[0]! : '';
}
export function assignedOffer(
  campaign: { id: string; name: string },
  mappings: Record<string, string> = {},
) {
  return Object.hasOwn(mappings, campaign.id)
    ? mappings[campaign.id]!
    : campaignOffer(campaign.name);
}
export function conversionRate(
  snapshot: RealCampaignSnapshot,
  source: string,
  target: string,
  date: string,
): number | null {
  if (source === target) return 1;
  const dates = Object.keys(snapshot.fx?.rates ?? {})
    .filter((day) => day <= date && (Date.parse(date) - Date.parse(day)) / 86400000 <= 7)
    .sort();
  const rates = snapshot.fx?.rates[dates.at(-1) ?? ''];
  const a = source === 'USD' ? 1 : rates?.[source];
  const b = target === 'USD' ? 1 : rates?.[target];
  return a && b && Number.isFinite(a) && Number.isFinite(b) && a > 0 && b > 0 ? b / a : null;
}

export function metaPurchase(row: RealCampaignSnapshot['insights'][number]) {
  // Meta exposes overlapping purchase aliases; choose one type rather than adding them.
  const type = ['offsite_conversion.fb_pixel_purchase', 'purchase', 'omni_purchase'].find((type) =>
    row.actions.some((action) => action.action_type === type),
  );
  const count = Number(row.actions.find((action) => action.action_type === type)?.value ?? 0);
  const value = row.actionValues?.find((action) => action.action_type === type);
  return { count, value: value ? Number(value.value) : row.actionValues && count === 0 ? 0 : null };
}

export function tmxGeneralRoas(
  final: number | null | undefined,
  spend: number,
  incomplete = false,
): number | null {
  return incomplete ||
    final == null ||
    !Number.isFinite(final) ||
    !Number.isFinite(spend) ||
    spend <= 0
    ? null
    : final / spend;
}

export function realCampaignRows(
  snapshot: RealCampaignSnapshot,
  range: DateRange,
  filters: {
    currency: string;
    account: string;
    business: string;
    status: string;
    query: string;
    deliveryOnly: boolean;
    offer?: string;
    mappings?: Record<string, string>;
    level?: 'campaigns' | 'adsets' | 'ads';
    includeAttributedZeroSpend?: boolean;
  },
): ReportRow[] {
  const rateCache = new Map<string, number | null>();
  const cachedRate: typeof conversionRate = (snapshot, source, target, date) => {
    const key = `${source}:${target}:${date}`;
    if (!rateCache.has(key)) rateCache.set(key, conversionRate(snapshot, source, target, date));
    return rateCache.get(key)!;
  };
  const accounts = new Map(snapshot.accounts.map((account) => [account.id, account]));
  const hasActivity = (row: RealCampaignSnapshot['insights'][number]) =>
    Number(row.spend) > 0 ||
    Number(row.impressions ?? 0) > 0 ||
    Number(row.linkClicks ?? 0) > 0 ||
    row.actions.some((action) => Number(action.value) > 0);
  const metrics = new Map<string, RealCampaignSnapshot['insights']>();
  const seen = new Set<string>();
  for (const row of snapshot.insights) {
    if (row.date < range.from || row.date > range.to) continue;
    const key = `${row.accountId}:${row.campaignId}:${row.adId ?? ''}:${row.date}:${row.hour ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const group = metrics.get(row.campaignId) ?? [];
    group.push(row);
    metrics.set(row.campaignId, group);
  }
  return snapshot.campaigns
    .filter((campaign) => {
      const account = accounts.get(campaign.accountId);
      return (
        !!account &&
        (!filters.account || campaign.accountId === filters.account) &&
        (!filters.business || account.businessId === filters.business) &&
        (!filters.status || campaign.effectiveStatus === filters.status) &&
        (!filters.offer ||
          (filters.offer === '__unclassified'
            ? !assignedOffer(campaign, filters.mappings)
            : assignedOffer(campaign, filters.mappings) === filters.offer)) &&
        (metrics.get(campaign.id) ?? []).some((row) =>
          filters.includeAttributedZeroSpend ? hasActivity(row) : Number(row.spend) > 0,
        ) &&
        `${campaign.name} ${campaign.id} ${account.name}`
          .toLocaleLowerCase('pt-BR')
          .includes(filters.query.trim().toLocaleLowerCase('pt-BR'))
      );
    })
    .flatMap((campaign) => {
      const account = accounts.get(campaign.accountId)!;
      const campaignData = metrics.get(campaign.id) ?? [];
      const level = filters.level ?? 'campaigns';
      const groups = new Map<string, typeof campaignData>();
      for (const row of campaignData) {
        const id = level === 'ads' ? row.adId : level === 'adsets' ? row.adsetId : campaign.id;
        if (!id) continue;
        const group = groups.get(id) ?? [];
        group.push(row);
        groups.set(id, group);
      }
      return [...groups]
        .filter(([, data]) =>
          data.some((row) =>
            level === 'campaigns' && !filters.includeAttributedZeroSpend
              ? Number(row.spend) > 0
              : hasActivity(row),
          ),
        )
        .map(([id, data]) => {
          const rateMissing = data.some(
            (row) => cachedRate(snapshot, row.currency, filters.currency, row.date) === null,
          );
          const unavailable =
            snapshot.failures.some(
              (failure) => failure.accountId === campaign.accountId && failure.stage === 'insights',
            ) ||
            range.from < snapshot.from ||
            range.to > snapshot.to ||
            rateMissing;
          const spend =
            Math.round(
              data.reduce(
                (sum, row) =>
                  sum +
                  Number(row.spend) *
                    (cachedRate(snapshot, row.currency, filters.currency, row.date) ?? 0),
                0,
              ) * 1e8,
            ) / 1e8;
          const impressions = data.reduce((sum, row) => sum + Number(row.impressions), 0);
          const impressionMissing = data.some((row) => row.impressions === null);
          const clickMissing = data.some((row) => row.linkClicks === null);
          const clicks = data.reduce((sum, row) => sum + Number(row.linkClicks ?? 0), 0);
          const checkouts = data.reduce(
            (sum, row) =>
              sum +
              Number(
                (
                  row.actions.find(
                    (action) =>
                      action.action_type === 'offsite_conversion.fb_pixel_initiate_checkout',
                  ) ?? row.actions.find((action) => action.action_type === 'initiate_checkout')
                )?.value ?? 0,
              ),
            0,
          );
          const purchases = data.map(metaPurchase);
          const frontSales =
            snapshot.purchaseClassification === 'front_only_user_confirmed' && !unavailable
              ? purchases.reduce((sum, item) => sum + item.count, 0)
              : null;
          const metaPurchaseValue =
            unavailable ||
            data.some((row) => row.actionValues == null) ||
            purchases.some((item) => item.value === null)
              ? null
              : Math.round(
                  purchases.reduce(
                    (sum, item, index) =>
                      sum +
                      item.value! *
                        (cachedRate(
                          snapshot,
                          data[index]!.currency,
                          filters.currency,
                          data[index]!.date,
                        ) ?? 0),
                    0,
                  ) * 1e8,
                ) / 1e8;
          const videoRows = data.filter((row) => row.video === true);
          const landingViews = data.reduce(
            (sum, row) =>
              sum +
              Number(
                row.actions.find((action) => action.action_type === 'landing_page_view')?.value ??
                  0,
              ),
            0,
          );
          const videoImpressions = videoRows.reduce(
            (sum, row) => sum + Number(row.impressions ?? 0),
            0,
          );
          const videoViews = videoRows.reduce(
            (sum, row) =>
              sum +
              Number(row.actions.find((action) => action.action_type === 'video_view')?.value ?? 0),
            0,
          );
          const result: ReportMetrics = {
            ...reportMetrics([]),
            spend,
            impressions,
            clicks,
            checkouts,
            videoImpressions:
              data.some((row) => row.video == null) ||
              videoRows.some((row) => row.impressions === null)
                ? null
                : videoImpressions,
            videoViews:
              data.some((row) => row.video == null) ||
              videoRows.some((row) => row.impressions === null)
                ? null
                : videoViews,
            frontSales,
            fees: null,
            refunds: null,
            penalties: null,
            reserve: null,
            finalResult: null,
            afterMedia: null,
            roi: null,
            roas: null,
            hookRate:
              !data.some((row) => row.video == null) &&
              !unavailable &&
              videoImpressions &&
              !videoRows.some((row) => row.impressions === null)
                ? videoViews / videoImpressions
                : null,
            cpa: frontSales ? spend / frontSales : null,
            metaLandingViews: unavailable ? null : landingViews,
            connectRate: !unavailable && !clickMissing && clicks > 0 ? landingViews / clicks : null,
            metaLandingConversion:
              frontSales === null || !landingViews || unavailable
                ? null
                : frontSales / landingViews,
            checkoutConversion: frontSales === null || !checkouts ? null : frontSales / checkouts,
            metaPurchaseValue,
            metaRoas: metaPurchaseValue === null || !spend ? null : metaPurchaseValue / spend,
            metaGrossRoi:
              metaPurchaseValue === null || !spend ? null : (metaPurchaseValue - spend) / spend,
            cpm:
              impressions && !impressionMissing && !unavailable
                ? (spend / impressions) * 1000
                : null,
            cpc: clicks && !clickMissing && !unavailable ? spend / clicks : null,
            ctr:
              impressions && !impressionMissing && !clickMissing && !unavailable
                ? clicks / impressions
                : null,
            costCheckout: checkouts && !unavailable ? spend / checkouts : null,
          };
          return {
            id,
            name:
              level === 'ads'
                ? (data[0]!.adName ?? id)
                : level === 'adsets'
                  ? (data[0]!.adsetName ?? id)
                  : campaign.name,
            status: campaignStatusLabel(
              level === 'ads'
                ? (snapshot.ads?.find((ad) => ad.id === id)?.status ?? 'UNKNOWN')
                : campaign.effectiveStatus,
            ),
            subtitle: `${assignedOffer(campaign, filters.mappings) || 'Não classificado'} · ${account.name} · ${id}${unavailable ? ' · métricas incompletas' : ''}`,
            metrics: result,
            unavailable,
            missingMetrics: [
              ...(impressionMissing ? ['impressions' as const] : []),
              ...(clickMissing ? ['clicks' as const] : []),
            ],
          };
        });
    })
    .sort((a, b) => b.metrics.spend - a.metrics.spend || a.name.localeCompare(b.name));
}

export function trafficTotals(rows: ReportRow[]): ReportMetrics {
  const sum = (key: keyof ReportMetrics) =>
    rows.some(
      (row) => row.unavailable || row.missingMetrics?.includes(key) || row.metrics[key] === null,
    )
      ? null
      : rows.reduce((total, row) => total + row.metrics[key]!, 0);
  const spend = sum('spend') ?? 0;
  const landingViews = sum('metaLandingViews');
  const videoImpressions = sum('videoImpressions');
  const videoViews = sum('videoViews');
  const frontSales = sum('frontSales');
  const checkouts = sum('checkouts') ?? 0;
  const impressions = sum('impressions') ?? 0;
  const clicks = sum('clicks') ?? 0;
  const value = sum('metaPurchaseValue');
  return {
    ...reportMetrics([]),
    spend,
    frontSales,
    checkouts,
    impressions,
    clicks,
    metaPurchaseValue: value,
    cpa: frontSales ? spend / frontSales : null,
    costCheckout: checkouts ? spend / checkouts : null,
    cpm: impressions ? (spend / impressions) * 1000 : null,
    cpc: clicks ? spend / clicks : null,
    ctr: impressions ? clicks / impressions : null,
    checkoutConversion: frontSales === null || !checkouts ? null : frontSales / checkouts,
    metaRoas: value === null || !spend ? null : value / spend,
    metaGrossRoi: value === null || !spend ? null : (value - spend) / spend,
    metaLandingViews: landingViews,
    connectRate:
      landingViews !== null && sum('clicks') !== null && clicks > 0 ? landingViews / clicks : null,
    metaLandingConversion: frontSales === null || !landingViews ? null : frontSales / landingViews,
    videoImpressions,
    videoViews,
    hookRate: videoImpressions && videoViews !== null ? videoViews / videoImpressions : null,
    roi: null,
    roas: null,
    finalResult: null,
    afterMedia: null,
    fees: null,
    refunds: null,
    penalties: null,
    reserve: null,
  };
}

export type NativeFinanceOffer = Pick<
  import('@/lib/api-client').TrackingOverviewOffer,
  | 'offer_id'
  | 'offer_name'
  | 'owner_id'
  | 'fees_missing_operations'
  | 'gross_revenue_brl_minor'
  | 'gross_revenue_usd_minor'
  | 'net_available_brl_minor'
  | 'net_available_usd_minor'
>;
export function nativeTrafficFinance(
  rows: NativeFinanceOffer[] | undefined,
  userId: string | undefined,
  offer: string,
  links: Record<string, string>,
  currency: 'BRL' | 'USD',
  authorizedOffers = false,
) {
  if (!rows || !userId || offer === '__unclassified') return null;
  const own = authorizedOffers ? rows : rows.filter((row) => row.owner_id === userId);
  const candidates = own.filter((row) => row.offer_name.toUpperCase() === offer.toUpperCase());
  const id = links[offer] || (candidates.length === 1 ? candidates[0]!.offer_id : '');
  const selected = offer ? own.filter((row) => row.offer_id === id) : own;
  if (!selected.length || selected.some((row) => (row.fees_missing_operations ?? 0) > 0))
    return null;
  const minor = (field: 'net_available' | 'gross_revenue') => {
    const key = `${field}_${currency.toLowerCase()}_minor` as keyof (typeof selected)[number];
    const values = selected.map((row) => Number(row[key]));
    return values.every(Number.isSafeInteger) ? values.reduce((a, b) => a + b, 0) / 100 : null;
  };
  return { final: minor('net_available'), gross: minor('gross_revenue') };
}
