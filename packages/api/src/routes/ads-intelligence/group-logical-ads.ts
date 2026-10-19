import type { Offer } from '@page-cloner/shared';
import {
  adsCalendarDay,
  advertiserPage,
  logicalAd,
  matchCampaign,
  stringField,
} from '../../services/ads-intelligence.js';
import { type Metrics, metrics, sum } from './credentials.js';
export function groupLogicalAds(
  rows: Record<string, unknown>[],
  offers: Offer[],
  excludedCampaigns: Set<string>,
  manual: Map<string, string>,
  from: string | undefined,
  to: string | undefined,
  failedAccount: (platform: string, account: string) => boolean,
) {
  const pending = new Map<
    string,
    {
      campaign_key: string;
      campaign_name: string;
      reason: string;
      rows: number;
      can_map_offer: boolean;
    }
  >();
  const ads = new Map<
    string,
    {
      key: string;
      name: string;
      offer_id: string;
      batch: string;
      data: Metrics;
      ids: Set<string>;
      days: Set<string>;
      campaign: string;
      logical: NonNullable<ReturnType<typeof logicalAd>>;
      sources: Map<string, Record<string, string>>;
      blocked: boolean;
      missingRevenue: boolean;
    }
  >();
  for (const row of rows) {
    const raw = row.raw as Record<string, unknown>;
    const campaign = stringField(raw, 'campaignName');
    if (excludedCampaigns.has(campaign)) continue;
    const campaignKey = JSON.stringify([
      raw.platform ?? 'meta',
      raw.adAccountId ?? '',
      raw.campaignId ?? '',
      campaign,
    ]);
    const campaignOffer = campaign ? matchCampaign(campaign, offers) : null;
    const creativeOffer = matchCampaign(stringField(raw, 'name'), offers);
    const conflict = campaignOffer && creativeOffer && campaignOffer !== creativeOffer;
    const offerId = manual.get(campaignKey) ?? (conflict ? null : (campaignOffer ?? creativeOffer));
    const offerName = offers.find((o) => o.id === offerId)?.name ?? '';
    const logical = logicalAd(stringField(raw, 'name'), stringField(raw, 'adsetName'), offerName);
    const day = adsCalendarDay(row.day);
    const covered = Boolean(from && to && from <= day && day <= to);
    if (
      !offerId ||
      !offers.some((o) => o.id === offerId) ||
      !logical ||
      row.currency !== 'BRL' ||
      !covered
    ) {
      const p = pending.get(campaignKey) ?? {
        campaign_key: campaignKey,
        campaign_name: campaign || `Hierarquia não informada: ${stringField(raw, 'name')}`,
        reason: !covered
          ? 'Data fora do período de custos confirmado'
          : row.currency !== 'BRL'
            ? 'Moeda BRL não confirmada'
            : conflict && !manual.has(campaignKey)
              ? 'Oferta conflitante entre campanha e anúncio'
              : !logical
                ? 'Leva/anúncio ambíguo'
                : 'Oferta/hierarquia não identificada',
        can_map_offer: Boolean(campaign && logical && row.currency === 'BRL' && !offerId),
        rows: 0,
      };
      p.rows++;
      pending.set(campaignKey, p);
      continue;
    }
    const key = JSON.stringify([offerId, logical.batch, logical.ad, logical.variant]);
    const existing = ads.get(key);
    const data = metrics(raw);
    const source = {
      platform: stringField(raw, 'platform') || 'meta',
      account_id: stringField(raw, 'adAccountId'),
      campaign_id: stringField(raw, 'campaignId'),
      campaign_name: campaign,
      adset_id: stringField(raw, 'adsetId'),
      adset_name: stringField(raw, 'adsetName'),
      ad_id: stringField(raw, 'adId'),
      ad_name: stringField(raw, 'name'),
      ...advertiserPage(raw),
    };
    if (existing) {
      sum(existing.data, data);
      existing.ids.add(stringField(raw, 'adId'));
      existing.days.add(day);
      existing.sources.set(JSON.stringify(source), source);
      existing.blocked ||= failedAccount(source.platform, source.account_id);
    } else
      ads.set(key, {
        key,
        name: `${logical.ad}${logical.variant ? ` · ${logical.variant}` : ''}`,
        offer_id: offerId,
        batch: logical.batch,
        data,
        campaign,
        logical,
        sources: new Map([[JSON.stringify(source), source]]),
        days: new Set([day]),
        ids: new Set([stringField(raw, 'adId')].filter(Boolean)),
        blocked: failedAccount(source.platform, source.account_id),
        missingRevenue: false,
      });
  }
  return { pending, ads };
}
