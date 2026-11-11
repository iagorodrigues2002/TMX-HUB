import { z } from 'zod';
import type { RealCampaignSnapshot } from './real-campaigns-model';
import type { ReportLevel, ReportRow } from './traffic-reports-model';
const id = z.string().regex(/^\d+$/).nullable();
const money = z
  .string()
  .regex(/^-?\d+$/)
  .refine((v) => Number.isSafeInteger(Number(v)))
  .nullable();
export const trafficAttributionResponse = z.object({
  source: z.literal('tmx-tracking'),
  ownerId: z.string(),
  from: z.string(),
  to: z.string(),
  fetchedAt: z.string().datetime(),
  rows: z.array(
    z.object({
      offerId: z.string(),
      campaignId: id,
      adsetId: id,
      adId: id,
      accountId: id,
      fronts: z.number().int().nonnegative(),
      upsells: z.number().int().nonnegative(),
      naturalUpsells: z.number().int().nonnegative(),
      clickedUpsells: z.number().int().nonnegative(),
      naturalGrossBrlMinor: money,
      clickedGrossBrlMinor: money,
      naturalGrossUsdMinor: money,
      clickedGrossUsdMinor: money,
      grossBrlMinor: money,
      netBrlMinor: money,
      grossUsdMinor: money,
      upsellGrossBrlMinor: money.optional(),
      upsellGrossUsdMinor: money.optional(),
      netUsdMinor: money,
    }),
  ),
});
export type TrafficAttribution = z.infer<typeof trafficAttributionResponse>;
export const tmxAttributionColumns = [
  'tmxFronts',
  'upsells',
  'naturalUpsells',
  'clickedUpsells',
  'funnelArpu',
  'naturalArpu',
  'clickedArpu',
  'tmxAttributedRoas',
] as const;
export function groupTrafficAttribution(
  meta: RealCampaignSnapshot,
  data: TrafficAttribution | undefined,
  level: ReportLevel = 'campaigns',
) {
  const groups = new Map<string, TrafficAttribution['rows']>();
  if (!data || data.from !== meta.from || data.to !== meta.to)
    return { groups, unmatchedUpsells: 0 };
  const campaigns = new Map(meta.campaigns.map((c) => [c.id, c]));
  const ads = new Map<string, RealCampaignSnapshot['insights'][number]>();
  const ambiguous = new Set<string>();
  for (const row of meta.insights) {
    if (!row.adId) continue;
    const prev = ads.get(row.adId);
    if (prev && (prev.campaignId !== row.campaignId || prev.accountId !== row.accountId))
      ambiguous.add(row.adId);
    ads.set(row.adId, row);
  }
  let unmatchedUpsells = 0;
  for (const record of data.rows) {
    const ad = record.adId && !ambiguous.has(record.adId) ? ads.get(record.adId) : undefined;
    const campaignId = record.campaignId ?? ad?.campaignId;
    const campaign = campaignId ? campaigns.get(campaignId) : undefined;
    if (
      !campaign ||
      (ad && ad.campaignId !== campaign.id) ||
      (record.adsetId && ad?.adsetId && record.adsetId !== ad.adsetId) ||
      (record.accountId && `act_${record.accountId}` !== campaign.accountId) ||
      (record.adId && ambiguous.has(record.adId))
    ) {
      unmatchedUpsells += record.upsells;
      continue;
    }
    const key =
      level === 'campaigns'
        ? campaign.id
        : level === 'ads'
          ? record.adId
          : (record.adsetId ?? ad?.adsetId);
    if (!key) continue;
    const group = groups.get(key) ?? [];
    group.push(record);
    groups.set(key, group);
  }
  return { groups, unmatchedUpsells };
}

export function summarizeTrafficAttribution(
  records: TrafficAttribution['rows'] | undefined,
  currency: 'BRL' | 'USD',
  spend: number | null,
) {
  if (!records?.length)
    return {
      tmxFronts: null,
      tmxCpa: null,
      upsells: null,
      tmxGross: null,
      funnelArpu: null,
      naturalArpu: null,
      clickedArpu: null,
      naturalUpsells: null,
      clickedUpsells: null,
      tmxAttributedRoas: null,
    };
  const fronts = records.reduce((sum, record) => sum + record.fronts, 0);
  const grossKey = currency === 'BRL' ? 'grossBrlMinor' : 'grossUsdMinor';
  const netKey = currency === 'BRL' ? 'netBrlMinor' : 'netUsdMinor';
  const naturalKey = currency === 'BRL' ? 'naturalGrossBrlMinor' : 'naturalGrossUsdMinor';
  const clickedKey = currency === 'BRL' ? 'clickedGrossBrlMinor' : 'clickedGrossUsdMinor';
  const sumMoney = (
    key: typeof grossKey | typeof netKey | typeof naturalKey | typeof clickedKey,
  ) =>
    records.some((record) => record[key] === null)
      ? null
      : records.reduce((sum, record) => sum + Number(record[key]), 0) / 100;
  const arpu = (amount: number | null) => (amount === null || !fronts ? null : amount / fronts);
  const net = sumMoney(netKey);
  const gross = sumMoney(grossKey);
  return {
    tmxFronts: fronts,
    tmxCpa: spend === null || !fronts ? null : spend / fronts,
    upsells: records.reduce((sum, record) => sum + record.upsells, 0),
    naturalUpsells: records.reduce((sum, record) => sum + record.naturalUpsells, 0),
    clickedUpsells: records.reduce((sum, record) => sum + record.clickedUpsells, 0),
    tmxGross: gross,
    funnelArpu: arpu(gross),
    naturalArpu: arpu(sumMoney(naturalKey)),
    clickedArpu: arpu(sumMoney(clickedKey)),
    tmxAttributedRoas: net === null || spend === null || spend <= 0 ? null : net / spend,
  };
}

export function attributeTrafficRows(
  rows: ReportRow[],
  meta: RealCampaignSnapshot,
  data: TrafficAttribution | undefined,
  currency: 'BRL' | 'USD',
  level: ReportLevel = 'campaigns',
) {
  const { groups, unmatchedUpsells } = groupTrafficAttribution(meta, data, level);
  return {
    unmatchedUpsells,
    rows: rows.map((row) => ({
      ...row,
      metrics: {
        ...row.metrics,
        ...summarizeTrafficAttribution(
          groups.get(row.id),
          currency,
          row.unavailable ? null : row.metrics.spend,
        ),
      },
    })),
  };
}

export function summarizeCreativeAttribution(
  creatives: readonly { adIds: string[] }[],
  groups: ReadonlyMap<string, TrafficAttribution['rows']>,
  currency: 'BRL' | 'USD',
  { spend, metaPurchaseValue }: { spend: number | null; metaPurchaseValue: number | null },
) {
  const adIds = new Set(creatives.flatMap((creative) => creative.adIds));
  const records = [...adIds].flatMap((adId) => groups.get(adId) ?? []);
  const totals = summarizeTrafficAttribution(records, currency, spend);
  const upsellKey = currency === 'BRL' ? 'upsellGrossBrlMinor' : 'upsellGrossUsdMinor';
  const upsellGross =
    records.length > 0 && records.every((record) => record[upsellKey] != null)
      ? records.reduce((sum, record) => sum + Number(record[upsellKey]), 0) / 100
      : null;
  return {
    ...totals,
    tmxCreativeRoas:
      metaPurchaseValue === null || upsellGross === null || spend === null || spend <= 0
        ? null
        : (metaPurchaseValue + upsellGross) / spend,
  };
}
