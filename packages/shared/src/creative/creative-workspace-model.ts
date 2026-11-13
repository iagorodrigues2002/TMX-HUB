import { z } from 'zod';
import {
  type CreativeDriveCatalog,
  type ImportedCreativeFile,
  creativeFileIdentity,
} from './creative-drive-reader.js';
import type { CreativeAdReview, CreativeDriveState } from './creative-drive-state.js';
import {
  type CreativeStatus,
  creativeFallbackKey,
  creativeIdentity,
  creativeOffer,
} from './creative-identity.js';
import { type DateRange, daysAgoIso, toIsoDateInTimeZone } from './date-range.js';
import {
  type RealCampaignSnapshot,
  assignedOffer,
  realCampaignRows,
} from './real-campaigns-model.js';
import type { ReportMetrics } from './traffic-reports-model.js';

const additive = [
  'spend',
  'frontSales',
  'metaPurchaseValue',
  'checkouts',
  'clicks',
  'impressions',
  'metaLandingViews',
  'videoViews',
  'videoImpressions',
] as const;
export type CreativeAmounts = { [K in (typeof additive)[number]]: number | null };
export interface CreativeAd {
  id: string;
  name: string;
  offer: string;
  batch: string;
  campaign: string;
  account: string;
  status: string;
  amounts: CreativeAmounts;
  adIds: string[];
}
export interface DriveCreativeFile {
  name: string;
  url: string;
  batch: string;
}
export interface CreativeDriveFolder {
  folderUrl: string;
  files: DriveCreativeFile[];
}

export function driveUrl(value: string, kind: 'file' | 'folder'): string | null {
  try {
    const url = new URL(value);
    const pattern =
      kind === 'file'
        ? /^\/file\/d\/([A-Za-z0-9_-]{10,200})(?:\/view|\/preview)?\/?$/
        : /^\/drive\/(?:u\/\d+\/)?folders\/([A-Za-z0-9_-]{10,200})\/?$/;
    const id = pattern.exec(url.pathname)?.[1];
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'drive.google.com' ||
      url.port ||
      url.username ||
      url.password ||
      !id
    )
      return null;
    const result = new URL(
      kind === 'file'
        ? `https://drive.google.com/file/d/${id}/view`
        : `https://drive.google.com/drive/folders/${id}`,
    );
    const resourceKey = url.searchParams.get('resourcekey');
    if (resourceKey && /^[A-Za-z0-9_-]{1,200}$/.test(resourceKey))
      result.searchParams.set('resourcekey', resourceKey);
    return result.href;
  } catch {
    return null;
  }
}
export const creativeDriveSchema = z.record(
  z.string().max(128),
  z.object({
    folderUrl: z
      .string()
      .max(1000)
      .refine((v) => !v || !!driveUrl(v, 'folder')),
    files: z
      .array(
        z.object({
          name: z
            .string()
            .min(1)
            .max(255)
            .refine((v) => /\.mp4$/i.test(v)),
          url: z
            .string()
            .max(1000)
            .refine((v) => !v || !!driveUrl(v, 'file')),
          batch: z.string().max(80),
        }),
      )
      .max(500),
  }),
);

export const creativeName = (fileName: string) => fileName.replace(/\.mp4$/i, '');
export const creativeBatch = (...names: string[]) => {
  const numbers = [
    ...new Set(
      [...names.join(' ').matchAll(/(?:^|[^A-Z0-9])(?:LEVA|L)[\s_#-]*0*(\d+)(?=$|[^0-9])/gi)].map(
        (match) => Number(match[1]),
      ),
    ),
  ];
  return numbers.length === 1 ? `Leva ${numbers[0]}` : 'Sem leva';
};
export function matchDriveCreative(
  ad: Pick<CreativeAd, 'name' | 'offer'>,
  folders: Record<string, CreativeDriveFolder>,
) {
  const matches = (folders[ad.offer]?.files ?? []).filter((f) => creativeName(f.name) === ad.name);
  if (matches.length > 1) return { status: 'ambiguous' as const, file: null };
  if (!matches.length) return { status: 'unmatched' as const, file: null };
  const file = matches[0]!;
  return { status: file.url ? ('linked' as const) : ('missing_link' as const), file };
}
export function creativeMetrics(ads: CreativeAd[]) {
  const amounts = Object.fromEntries(
    additive.map((key) => [
      key,
      ads.some((ad) => ad.amounts[key] === null)
        ? null
        : ads.reduce((n, ad) => n + (ad.amounts[key] ?? 0), 0),
    ]),
  ) as CreativeAmounts;
  const ratio = (a: number | null, b: number | null) => (a === null || !b ? null : a / b);
  return {
    ...amounts,
    cpa: ratio(amounts.spend, amounts.frontSales),
    metaRoas: ratio(amounts.metaPurchaseValue, amounts.spend),
    costCheckout: ratio(amounts.spend, amounts.checkouts),
    cpc: ratio(amounts.spend, amounts.clicks),
    cpm: amounts.impressions ? ratio(amounts.spend, amounts.impressions / 1000) : null,
    ctr: ratio(amounts.clicks, amounts.impressions),
    hookRate: ratio(amounts.videoViews, amounts.videoImpressions),
    connectRate: ratio(amounts.metaLandingViews, amounts.clicks),
  };
}
export const creativeColumns = [
  ['spend', 'Investimento', 'money'],
  ['frontSales', 'Vendas · Meta', 'count'],
  ['cpa', 'CPA', 'money'],
  ['metaRoas', 'ROAS Meta', 'ratio'],
  ['checkouts', 'IC', 'count'],
  ['costCheckout', 'Custo por IC', 'money'],
  ['cpc', 'CPC', 'money'],
  ['cpm', 'CPM', 'money'],
  ['ctr', 'CTR de link', 'percent'],
  ['hookRate', 'Hook Rate', 'percent'],
  ['connectRate', 'Connect Rate', 'percent'],
  ['impressions', 'Impressões', 'count'],
  ['clicks', 'Cliques no link', 'count'],
] as const;
export type CreativeMetricKey = (typeof creativeColumns)[number][0];

export function consolidateCreatives(ads: CreativeAd[]): CreativeAd[] {
  const groups = new Map<string, CreativeAd[]>();
  for (const ad of ads) {
    const key =
      creativeIdentity(ad.name, ad.offer, ad.batch)?.key ??
      JSON.stringify([ad.offer, ad.batch, ad.name]);
    groups.set(key, [...(groups.get(key) ?? []), ad]);
  }
  return [...groups].map(([id, rows]) => ({
    ...rows[0]!,
    id,
    campaign: `${new Set(rows.map((r) => r.campaign)).size} campanha(s)`,
    account: `${new Set(rows.map((r) => r.account)).size} conta(s)`,
    status: rows.every((r) => r.status === rows[0]!.status) ? rows[0]!.status : 'Entrega mista',
    amounts: creativeMetrics(rows),
    adIds: [...new Set(rows.flatMap((r) => r.adIds))],
  }));
}
export interface CreativeRecord extends CreativeAd {
  files: ImportedCreativeFile[];
  principal: ImportedCreativeFile | null;
  sources: CreativeAd[];
}
function principalCreativeFile(files: ImportedCreativeFile[], principalId?: string) {
  const chosen = files.find((file) => file.id === principalId);
  if (chosen || files.length <= 1) return chosen ?? files[0] ?? null;
  const clean = files.filter(
    (file) =>
      !/(?:[ _-](?:creative|criative|criativo|reedito|reedit|copy|c[oó]pia|compressed|comprimido|raw|bruto)(?:[ _-]*\d+)?|\s*\(\d+\))$/i.test(
        creativeName(file.name).trim(),
      ),
  );
  return clean.length === 1 ? clean[0]! : null;
}

export function creativeCatalogRows(
  ads: CreativeAd[],
  catalog: CreativeDriveCatalog | null,
  principals: Record<string, { principalId?: string }> = {},
  reviewedAds: Record<string, CreativeAdReview> = {},
): CreativeRecord[] {
  const groups = new Map<
    string,
    {
      name: string;
      offer: string;
      batch: string;
      files: ImportedCreativeFile[];
      sources: CreativeAd[];
    }
  >();
  const exactFileGroups = new Map<string, Set<string>>();
  const fileGroups = new Map<string, string>();
  const filenameKey = (name: string, offer: string) =>
    creativeFallbackKey(name.trim().normalize('NFC').toLowerCase(), offer, '');
  for (const file of catalog?.files ?? []) {
    const identity = creativeFileIdentity(file);
    const key = identity?.key ?? creativeFallbackKey(file.name, file.offer, file.batch);
    const group = groups.get(key) ?? {
      name: identity?.name ?? creativeName(file.name),
      offer: file.offer,
      batch: file.batch,
      files: [],
      sources: [],
    };
    group.files.push(identity === file.identity ? file : { ...file, identity });
    groups.set(key, group);
    fileGroups.set(file.id, key);
    const filename = filenameKey(file.name, file.offer);
    const matches = exactFileGroups.get(filename) ?? new Set<string>();
    matches.add(key);
    exactFileGroups.set(filename, matches);
  }
  const seen = new Set<string>();
  for (const source of ads) {
    const candidate = reviewedAds[source.id];
    const originalOffer = creativeOffer(source.offer);
    const review =
      candidate?.name === source.name &&
      candidate.campaign === source.campaign &&
      (source.batch === 'Sem leva' || source.batch === candidate.batch) &&
      (originalOffer === 'SEM_OFERTA' || originalOffer === candidate.offer)
        ? candidate
        : undefined;
    const ad = review ? { ...source, offer: review.offer, batch: review.batch } : source;
    if (seen.has(ad.id)) continue;
    seen.add(ad.id);
    let identity = review ? null : creativeIdentity(ad.name, ad.offer, ad.batch);
    const currentKey = identity?.key ?? creativeFallbackKey(ad.name, ad.offer, ad.batch);
    const exact = exactFileGroups.get(filenameKey(ad.name, ad.offer));
    const exactKey =
      !review &&
      ad.batch === 'Sem leva' &&
      identity?.batch == null &&
      !groups.get(currentKey)?.files.length &&
      exact?.size === 1
        ? [...exact][0]
        : undefined;
    if (!exactKey && identity?.batch === null) {
      const candidates = [...groups.keys()].filter(
        (k) =>
          k.startsWith(`${identity!.offer}:AD${identity!.ad}:L`) &&
          groups
            .get(k)!
            .files.some((f) => f.identity?.variant === identity!.variant && !f.archived),
      );
      if (candidates.length === 1) identity = groups.get(candidates[0]!)!.files[0]!.identity;
    }
    const reviewedKey = review?.fileId ? fileGroups.get(review.fileId) : undefined;
    const reviewedGroup = reviewedKey ? groups.get(reviewedKey) : undefined;
    const confirmedKey =
      reviewedGroup?.offer === ad.offer &&
      (ad.batch === 'Sem leva' || reviewedGroup.batch === ad.batch)
        ? reviewedKey
        : undefined;
    const key = review
      ? (confirmedKey ?? `unmatched:reviewed:${currentKey}`)
      : (exactKey ?? identity?.key ?? currentKey);
    const group = groups.get(key) ?? {
      name: identity?.name ?? ad.name,
      offer: creativeOffer(ad.offer),
      batch: identity?.batch == null ? ad.batch : `Leva ${identity.batch}`,
      files: [],
      sources: [],
    };
    group.sources.push(ad);
    groups.set(key, group);
  }
  return [...groups].map(([id, group]) => ({
    id,
    name: group.name,
    offer: group.offer,
    batch: group.batch,
    files: group.files,
    principal: principalCreativeFile(group.files, principals[id]?.principalId),
    sources: group.sources,
    campaign: `${new Set(group.sources.map((a) => a.campaign)).size} campanha(s)`,
    account: `${new Set(group.sources.map((a) => a.account)).size} conta(s)`,
    status: 'Criativo',
    amounts: group.sources.length
      ? creativeMetrics(group.sources)
      : (Object.fromEntries(additive.map((k) => [k, null])) as CreativeAmounts),
    adIds: [...new Set(group.sources.flatMap((a) => a.adIds))],
  }));
}
export function creativeAdsFromMeta(
  snapshot: RealCampaignSnapshot,
  range: DateRange,
  currency: string,
  mappings: Record<string, string>,
): CreativeAd[] {
  return realCampaignRows(snapshot, range, {
    currency,
    mappings,
    account: '',
    business: '',
    status: '',
    query: '',
    deliveryOnly: false,
    level: 'ads',
  }).map((row) => {
    const insight = snapshot.insights.find((i) => i.adId === row.id)!;
    const campaign = snapshot.campaigns.find((c) => c.id === insight.campaignId)!;
    const m = row.metrics;
    return {
      id: row.id,
      name: row.name,
      offer: assignedOffer(campaign, mappings) || 'Sem oferta',
      batch: creativeBatch(row.name, insight.adsetName ?? '', campaign.name),
      campaign: campaign.name,
      account: snapshot.accounts.find((a) => a.id === insight.accountId)?.name ?? insight.accountId,
      status: row.status ?? 'Não informado',
      adIds: [row.id],
      amounts: Object.fromEntries(
        additive.map((key) => [
          key,
          row.unavailable || row.missingMetrics?.includes(key) ? null : m[key],
        ]),
      ) as CreativeAmounts,
    };
  });
}

export function hasCreativeDeliveryCoverage(snapshot: RealCampaignSnapshot, range: DateRange) {
  return (
    snapshot.from <= range.from &&
    snapshot.to >= range.to &&
    !snapshot.failures.length &&
    Number.isFinite(Date.parse(snapshot.fetchedAt)) &&
    toIsoDateInTimeZone(snapshot.fetchedAt) === range.to
  );
}

export function creativeDeliveryAssessment(
  snapshot: RealCampaignSnapshot,
  range: DateRange,
  state: Pick<CreativeDriveState, 'catalog' | 'metadata' | 'reviewedAds'>,
  mappings: Record<string, string>,
) {
  const statuses = new Map<string, CreativeStatus>();
  const lowRoas: string[] = [];
  const delivering = new Set<string>();
  if (!hasCreativeDeliveryCoverage(snapshot, range)) return { statuses, lowRoas, delivering };

  const activeCampaigns = new Set(
    snapshot.campaigns.filter((campaign) => campaign.effectiveStatus === 'ACTIVE').map((c) => c.id),
  );
  const adsInActiveCampaigns = new Set<string>();
  const activeAds = new Set(
    snapshot.ads?.filter((ad) => ad.status === 'ACTIVE').map((ad) => ad.id),
  );
  const delivery = new Map<string, Set<string>>();
  for (const insight of snapshot.insights) {
    if (!insight.adId || insight.date < range.from || insight.date > range.to) continue;
    if (activeCampaigns.has(insight.campaignId)) adsInActiveCampaigns.add(insight.adId);
    const spend = Number(insight.spend);
    if (!Number.isFinite(spend) || spend <= 0) continue;
    const dates = delivery.get(insight.adId) ?? new Set<string>();
    dates.add(insight.date);
    delivery.set(insight.adId, dates);
  }
  const ads = creativeAdsFromMeta(snapshot, range, 'BRL', mappings);
  const rows = creativeCatalogRows(ads, state.catalog, state.metadata, state.reviewedAds);
  for (const row of rows) {
    const days = new Set(row.adIds.flatMap((id) => [...(delivery.get(id) ?? [])]));
    const lastSpend = [...days].sort().at(-1);
    const { spend, metaRoas } = creativeMetrics([row]);
    const active = row.adIds.some((id) => adsInActiveCampaigns.has(id));
    if (
      row.adIds.some((id) => adsInActiveCampaigns.has(id) && delivery.has(id) && activeAds.has(id))
    )
      delivering.add(row.id);
    if (!lastSpend || (spend !== null && spend < 1000)) {
      statuses.set(row.id, active ? 'Testando' : 'Stand by');
      continue;
    }
    if (spend === null) continue;
    if (spend >= 1500 && metaRoas !== null && metaRoas !== 1.4) {
      if (active && metaRoas < 1.4) lowRoas.push(row.id);
      statuses.set(row.id, metaRoas > 1.4 ? 'Validado' : 'Não validado');
      continue;
    }
    const stillRunning = lastSpend >= daysAgoIso(1, range.to);
    const passesDays =
      stillRunning &&
      Array.from({ length: 6 }, (_, i) => daysAgoIso(i, lastSpend)).every((date) => days.has(date));
    // Hoje ainda pode ter entrega. Conte somente dias encerrados para reprovar por inatividade.
    const stopped = lastSpend <= daysAgoIso(5, range.to);
    statuses.set(row.id, passesDays ? 'Validado' : stopped ? 'Não validado' : 'Testando');
  }
  return { statuses, lowRoas, delivering };
}

export function demoCreativeAds(range: DateRange, currency: 'BRL' | 'USD'): CreativeAd[] {
  // shortcut: synthetic amounts use a fixed demo FX; use the Meta snapshot for actual exchange rates.
  const days = Math.max(
    1,
    Math.min(366, Math.round((Date.parse(range.to) - Date.parse(range.from)) / 86400000) + 1),
  );
  const scale = days * (currency === 'USD' ? 0.2 : 1);
  return ['SLMD', 'PJR_ESP', 'PJR_ENG', 'SLM_FR', 'CPJRS', 'PJRN'].flatMap((offer, i) =>
    Array.from({ length: 5 }, (_, j) => {
      const name = `${offer}_L${j < 3 ? '19' : '20'}_AD${String(j === 2 ? 1 : j + 1).padStart(2, '0')}`;
      const impressions = (8200 + i * 680 + j * 1320) * days;
      return {
        id: `demo-ad-${i}-${j}`,
        name,
        offer,
        batch: creativeBatch(name),
        campaign: `${offer} · ${j === 2 ? 'Escala' : 'Teste'} · ${j < 3 ? 'L19' : 'L20'}`,
        account: `Conta ${j === 2 ? '02' : '01'}`,
        status: j === 4 ? 'Pausado' : 'Ativo',
        adIds: [`demo-ad-${i}-${j}`],
        amounts: {
          spend: (260 + i * 41 + j * 36) * scale,
          frontSales: Math.max(0, 9 - j + i) * days,
          metaPurchaseValue: (700 + i * 82 - j * 69) * scale,
          checkouts: (28 + i * 4 - j * 2) * days,
          clicks: (316 + i * 35 + j * 44) * days,
          impressions,
          metaLandingViews: (258 + i * 28 + j * 33) * days,
          videoViews: Math.round(impressions * (0.38 - j * 0.025)),
          videoImpressions: impressions,
        },
      };
    }),
  );
}
