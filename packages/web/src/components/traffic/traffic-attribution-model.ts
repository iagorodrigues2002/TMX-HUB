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
export function attributeTrafficRows(
  rows: ReportRow[],
  meta: RealCampaignSnapshot,
  data: TrafficAttribution | undefined,
  currency: 'BRL' | 'USD',
  level: ReportLevel = 'campaigns',
) {
  if (!data || data.from !== meta.from || data.to !== meta.to)
    return {
      rows: rows.map((row) => ({
        ...row,
        metrics: {
          ...row.metrics,
          tmxFronts: null,
          upsells: null,
          funnelArpu: null,
          naturalArpu: null,
          clickedArpu: null,
          naturalUpsells: null,
          clickedUpsells: null,
          tmxAttributedRoas: null,
        },
      })),
      unmatchedUpsells: 0,
    };
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
  const groups = new Map<string, TrafficAttribution['rows']>();
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
  return {
    unmatchedUpsells,
    rows: rows.map((row) => {
      const records = groups.get(row.id);
      if (!records?.length)
        return {
          ...row,
          metrics: {
            ...row.metrics,
            tmxFronts: null,
            upsells: null,
            funnelArpu: null,
            naturalArpu: null,
            clickedArpu: null,
            naturalUpsells: null,
            clickedUpsells: null,
            tmxAttributedRoas: null,
          },
        };
      const fronts = records.reduce((s, r) => s + r.fronts, 0);
      const upsells = records.reduce((s, r) => s + r.upsells, 0);
      const grossKey = currency === 'BRL' ? 'grossBrlMinor' : 'grossUsdMinor';
      const netKey = currency === 'BRL' ? 'netBrlMinor' : 'netUsdMinor';
      const naturalKey = currency === 'BRL' ? 'naturalGrossBrlMinor' : 'naturalGrossUsdMinor';
      const clickedKey = currency === 'BRL' ? 'clickedGrossBrlMinor' : 'clickedGrossUsdMinor';
      const sum = (key: typeof grossKey | typeof netKey | typeof naturalKey | typeof clickedKey) =>
        records.some((r) => r[key] === null)
          ? null
          : records.reduce((s, r) => s + Number(r[key]), 0) / 100;
      const gross = sum(grossKey);
      const net = sum(netKey);
      const natural = sum(naturalKey);
      const clicked = sum(clickedKey);
      return {
        ...row,
        metrics: {
          ...row.metrics,
          tmxFronts: fronts,
          upsells,
          naturalUpsells: records.reduce((s, r) => s + r.naturalUpsells, 0),
          clickedUpsells: records.reduce((s, r) => s + r.clickedUpsells, 0),
          funnelArpu: gross == null || !fronts ? null : gross / fronts,
          naturalArpu: natural == null || !fronts ? null : natural / fronts,
          clickedArpu: clicked == null || !fronts ? null : clicked / fronts,
          tmxAttributedRoas:
            net == null || row.unavailable || row.metrics.spend <= 0
              ? null
              : net / row.metrics.spend,
        },
      };
    }),
  };
}
