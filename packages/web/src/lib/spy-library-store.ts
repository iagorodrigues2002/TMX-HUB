import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { type CreativeStatus, analyzeSpyCreatives } from './spy-creative-analysis';
import { fingerprintSpyCreatives, hydrateSpyThumbnails } from './spy-creative-media';
import { spyDiscoveryNotice, spyDiscoverySeen, spyNoticeSchema } from './spy-discovery-notices';
import {
  type LibraryAd,
  LibraryFailure,
  libraryCountries,
  libraryDelta,
  libraryScope,
  normalizeLibrarySource,
  readLibrary,
} from './spy-library-reader';
import { persistSpyMedia, retainSpyMedia } from './spy-media-cache';
import { monitorSources } from './spy-monitor-sources';
import { readScrapeLibrary } from './spy-scrapecreators-reader';

const day = 86400000;
const adSchema = z.object({
  destinationDomains: z.array(z.string().max(253)).max(100).optional(),
  creativeRecoveredAt: z.string().datetime().optional(),
  creativeAssets: z
    .array(
      z.object({
        kind: z.enum(['image', 'video']),
        url: z.string().max(10000),
        sha256: z
          .string()
          .regex(/^[a-f0-9]{64}$/)
          .optional(),
      }),
    )
    .max(30)
    .optional(),
  creativeComplete: z.boolean().optional(),
  creativeText: z.string().max(100000).optional(),
  thumbnailDigest: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  id: z.string(),
  pageId: z.string(),
  pageName: z.string(),
  startedAt: z.string().nullable(),
  url: z.string(),
  thumbnailUrl: z.string().max(10000).optional(),
  title: z.string().max(500).optional(),
  description: z.string().max(10000).optional(),
  detailsVersion: z.literal(1).optional(),
  collationCount: z.number().int().positive().optional(),
  collationId: z.string().regex(/^\d+$/).optional(),
  pagePictureUrl: z.string().max(10000).optional(),
  thumbnailKey: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  pagePictureKey: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
});
const snapshotSchema = z.object({
  day: z.number().int().min(0).max(7),
  at: z.string(),
  scope: z.string(),
  countries: z.array(z.string()),
  ads: z.array(adSchema),
  added: z.array(z.string()),
  missing: z.array(z.string()),
  baseline: z.boolean(),
});
const partialSchema = z.object({
  scope: z.string(),
  revision: z.string(),
  at: z.string(),
  sourceIndex: z.number().int().min(0).max(20),
  cursor: z.string().max(1000000),
  seenCursors: z.array(z.string().max(1000000)).max(10000),
  ads: z.array(adSchema),
  pages: z.number().int().nonnegative(),
  creditsRemaining: z.number().int().nonnegative(),
});
const jobSchema = z.object({
  deletedAt: z.string().datetime().optional(),
  id: z.string(),
  name: z.string(),
  responsibleId: z.string().nullable().default(null),
  discoverySeen: z.array(z.string()).default([]),
  sources: z.array(z.string()),
  enabled: z.boolean(),
  optedIn: z.boolean().default(false),
  startedAt: z.string().nullable(),
  nextAt: z.string().nullable(),
  checkedAt: z.string().nullable(),
  error: z.string(),
  status: z.enum([
    'waiting',
    'prepared',
    'source_missing',
    'credentials_required',
    'collecting',
    'blocked',
    'active',
    'paused',
    'complete',
    'incomplete',
  ]),
  snapshots: z.array(snapshotSchema),
  partial: partialSchema.nullable().default(null),
});
const stateSchema = z.object({
  discoveryNamespace: z.string().default(''),
  catalog: z.array(z.unknown()).default([]),
  catalogRevision: z.string().default(''),
  drive: z.string().default(''),
  owner: z.string(),
  revision: z.string(),
  encrypted: z.string().nullable(),
  provider: z.enum(['meta', 'scrapecreators', 'browser']).default('meta'),
  requestBudget: z.number().int().nonnegative().max(100000).default(0),
  paidRequestsEnabled: z.boolean().default(false),
  unlimitedRequests: z.boolean().default(false),
  notices: z.array(spyNoticeSchema).default([]),
  spendingPlan: z
    .object({
      preparedAt: z.string(),
      creditLimit: z.number().int().min(1).max(100000),
      dailyLimit: z.number().int().min(1).max(100000),
      reserved: z.number().int().nonnegative(),
      dailyReserved: z.number().int().nonnegative(),
      reservationDay: z.string(),
    })
    .nullable()
    .default(null),
  creditsRemaining: z.number().int().nonnegative().nullable().default(null),
  countries: z.array(z.string()),
  testedAt: z.string().nullable(),
  connectionError: z.string(),
  testError: z.string().default(''),
  retryAfter: z.string().nullable().default(null),
  heartbeatAt: z.string().nullable(),
  jobs: z.record(z.string(), jobSchema),
});
export type LibraryState = z.infer<typeof stateSchema>;
export type LibraryJob = z.infer<typeof jobSchema>;
export type LibrarySnapshot = z.infer<typeof snapshotSchema>;
export function setSpyMonitoring(
  state: LibraryState,
  ids: string[],
  enabled: boolean,
  now = new Date(),
): LibraryState {
  const jobs = { ...state.jobs };
  for (const id of new Set(ids)) {
    const job = jobs[id];
    if (!job || job.deletedAt) throw Error('missing_job');
    if (enabled) {
      if (!job.sources.length) throw Error('missing_source');
      for (const source of job.sources) normalizeLibrarySource(source);
    }
    if (job.optedIn === enabled && job.enabled === enabled) continue;
    const last = job.snapshots
      .filter((v) => v.scope === libraryScope(job.sources, state.countries, state.provider))
      .at(-1);
    const nextAt = enabled
      ? new Date(
          Math.max(
            now.getTime(),
            job.startedAt && last
              ? Date.parse(job.startedAt) + (last.day + 1) * day
              : now.getTime(),
          ),
        ).toISOString()
      : null;
    jobs[id] = {
      ...job,
      optedIn: enabled,
      enabled,
      status: enabled ? (last?.day === 7 ? 'complete' : 'waiting') : 'paused',
      nextAt: last?.day === 7 ? null : nextAt,
    };
  }
  return { ...state, jobs };
}
export const spyLibraryDirectory = () =>
  process.env.TMX_SPY_DIRECTORY || join(homedir(), '.codex/local-data/tmx/spy-library');
const ownerFile = (owner: string) => `${createHash('sha256').update(owner).digest('hex')}.json`;
export function initialLibraryState(owner: string): LibraryState {
  return {
    discoveryNamespace: '',
    catalog: [],
    catalogRevision: '',
    drive: '',
    owner,
    revision: randomUUID(),
    encrypted: null,
    provider: 'meta',
    requestBudget: 0,
    paidRequestsEnabled: false,
    unlimitedRequests: false,
    notices: [],
    spendingPlan: null,
    creditsRemaining: null,
    countries: ['ALL'],
    testedAt: null,
    connectionError: '',
    testError: '',
    retryAfter: null,
    heartbeatAt: null,
    jobs: {},
  };
}
export async function readLibraryState(
  owner: string,
  dir = spyLibraryDirectory(),
): Promise<LibraryState> {
  try {
    const state = stateSchema.parse(
      JSON.parse(await readFile(join(dir, ownerFile(owner)), 'utf8')),
    );
    if (state.owner !== owner) throw Error('owner');
    return state;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return initialLibraryState(owner);
    throw Error('Estado local da Library inválido; arquivo preservado.');
  }
}
export async function changeLibraryState(
  owner: string,
  update: (s: LibraryState) => LibraryState,
  dir = spyLibraryDirectory(),
) {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const file = join(dir, ownerFile(owner));
  const lock = `${file}.lock`;
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  for (let n = 0; n < 50; n++) {
    try {
      handle = await open(lock, 'wx', 0o600);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      try {
        if (Date.now() - (await stat(lock)).mtimeMs > 60000) await unlink(lock);
      } catch {}
      await new Promise((r) => setTimeout(r, 40));
    }
  }
  if (!handle) throw Error('Estado local ocupado. Tente novamente.');
  const tmp = `${file}.${randomUUID()}.tmp`;
  try {
    const state = stateSchema.parse(update(await readLibraryState(owner, dir)));
    await writeFile(tmp, JSON.stringify(state), { mode: 0o600 });
    await rename(tmp, file);
    return state;
  } finally {
    await handle.close();
    await unlink(lock).catch(() => {});
    await unlink(tmp).catch(() => {});
  }
}
async function encryptionKey(dir: string) {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const path = join(dir, '.key');
  try {
    await writeFile(path, randomBytes(32), { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
  const key = await readFile(path);
  if (key.length !== 32) throw Error('Chave local inválida');
  return key;
}
export async function encryptLibraryToken(token: string, dir = spyLibraryDirectory()) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', await encryptionKey(dir), iv);
  const data = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((v) => v.toString('base64url')).join('.');
}
async function decryptLibraryToken(encrypted: string, dir: string) {
  const [iv, tag, data] = encrypted.split('.');
  if (!iv || !tag || !data) throw Error('invalid_cipher');
  const cipher = createDecipheriv(
    'aes-256-gcm',
    await encryptionKey(dir),
    Buffer.from(iv, 'base64url'),
  );
  cipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([cipher.update(Buffer.from(data, 'base64url')), cipher.final()]).toString(
    'utf8',
  );
}
export function enrollLibraryOffers(
  state: LibraryState,
  offers: {
    id: string;
    name: string;
    sources: string[];
    domains?: string[];
    responsibleId?: string | null;
  }[],
  now = new Date(),
) {
  const jobs = { ...state.jobs };
  for (const input of offers) {
    const offer = { ...input, sources: monitorSources(input.sources, input.domains) };
    let valid = offer.sources.length > 0;
    try {
      for (const source of offer.sources) normalizeLibrarySource(source);
    } catch {
      valid = false;
    }
    const old = jobs[offer.id];
    const changed = old && JSON.stringify(old.sources) !== JSON.stringify(offer.sources);
    jobs[offer.id] = old
      ? {
          ...old,
          deletedAt: undefined,
          name: offer.name,
          responsibleId:
            input.responsibleId === undefined ? old.responsibleId : input.responsibleId,
          sources: offer.sources,
          enabled: old.optedIn && old.enabled,
          ...(!old.optedIn
            ? { status: valid ? ('paused' as const) : ('source_missing' as const), nextAt: null }
            : {}),
          ...(changed
            ? {
                nextAt: now.toISOString(),
                error: !valid && offer.sources.length ? 'invalid_source' : '',
                status: !valid
                  ? 'source_missing'
                  : old.optedIn && old.enabled
                    ? 'waiting'
                    : 'paused',
              }
            : {}),
        }
      : {
          id: offer.id,
          name: offer.name,
          responsibleId: input.responsibleId ?? null,
          discoverySeen: [],
          sources: offer.sources,
          enabled: false,
          optedIn: false,
          startedAt: null,
          nextAt: null,
          checkedAt: null,
          error: !valid && offer.sources.length ? 'invalid_source' : '',
          status: valid ? 'paused' : 'source_missing',
          snapshots: [],
          partial: null,
        };
  }
  return { ...state, jobs };
}
export function prepareScrapeMonitoring(
  state: LibraryState,
  now = new Date(),
  creditLimit = 6150,
  dailyLimit = 1000,
): LibraryState {
  if (state.provider === 'scrapecreators' && state.spendingPlan)
    return { ...state, paidRequestsEnabled: false, requestBudget: 0 };
  return {
    ...state,
    provider: 'scrapecreators',
    paidRequestsEnabled: false,
    requestBudget: 0,
    spendingPlan: {
      preparedAt: now.toISOString(),
      creditLimit,
      dailyLimit,
      reserved: 0,
      dailyReserved: 0,
      reservationDay: '',
    },
    revision: randomUUID(),
    countries: ['ALL'],
    connectionError: '',
    testError: '',
    retryAfter: null,
    jobs: Object.fromEntries(
      Object.entries(state.jobs).map(([id, j]) => [
        id,
        {
          ...j,
          optedIn: !!j.sources.length,
          enabled: !!j.sources.length,
          status: j.sources.length ? 'prepared' : 'source_missing',
          startedAt: null,
          nextAt: null,
          partial: null,
          error: '',
        },
      ]),
    ),
  };
}
export function publicLibraryState(state: LibraryState) {
  const entries = Object.entries(state.jobs).filter(([, j]) => !j.deletedAt);
  const jobs = entries.map(([, j]) => j);
  const verified = jobs.filter((j) => {
    const last = latestLibrarySnapshot(state, j.id);
    return (
      j.optedIn &&
      !j.error &&
      last &&
      last.scope === libraryScope(j.sources, state.countries, state.provider) &&
      Date.now() - Date.parse(last.at) < day
    );
  }).length;
  return {
    monitoringCoverage: {
      total: jobs.length,
      enrolled: jobs.filter((j) => j.optedIn).length,
      verified,
      pending: jobs.length - verified,
    },
    connected: state.provider === 'browser' || !!state.encrypted,
    provider: state.provider,
    requestBudget: state.requestBudget,
    paidRequestsEnabled: state.paidRequestsEnabled,
    unlimitedRequests: state.unlimitedRequests,
    spendingPlan: state.spendingPlan,
    creditsRemaining: state.creditsRemaining,
    countries: state.countries,
    testedAt: state.testedAt,
    connectionError: state.connectionError,
    testError: state.testError,
    retryAfter: state.retryAfter,
    heartbeatAt: state.heartbeatAt,
    coverage:
      state.provider === 'browser'
        ? 'Coletor autônomo · Library global.'
        : state.provider === 'scrapecreators'
          ? 'Library global via ScrapeCreators.'
          : 'API Meta; cobertura limitada.',
    jobs: Object.fromEntries(
      entries.map(([id, { partial, discoverySeen, ...j }]) => [
        id,
        {
          ...j,
          currentReadings: j.snapshots.filter(
            (v) => v.scope === libraryScope(j.sources, state.countries, state.provider),
          ).length,
          creativeSummary: latestLibrarySnapshot(state, id)
            ? analyzeSpyCreatives(j.snapshots, latestLibrarySnapshot(state, id)!).summary
            : null,
          progress: partial
            ? { count: partial.ads.length, pages: partial.pages, at: partial.at }
            : null,
          snapshots: j.snapshots.map((v) => {
            const pages = libraryPageSummaries(j, v);
            return {
              day: v.day,
              at: v.at,
              count: v.ads.length,
              scope: v.scope,
              currentScope: v.scope === libraryScope(j.sources, state.countries, state.provider),
              countries: v.countries,
              added: v.added.length,
              missing: v.missing.length,
              baseline: v.baseline,
              pagesCount: pages.filter((p) => p.change !== 'missing').length,
              newPages: pages.filter((p) => p.change === 'new').length,
              returningPages: pages.filter((p) => p.change === 'returned').length,
              newAds: v.ads
                .filter((a) => v.added.includes(a.id))
                .slice(0, 20)
                .map((a) => ({
                  id: a.id,
                  pageId: a.pageId,
                  pageName: a.pageName,
                  startedAt: a.startedAt,
                  url: a.url,
                })),
            };
          }),
        },
      ]),
    ),
  };
}
function latestLibrarySnapshot(state: LibraryState, id: string) {
  const job = state.jobs[id];
  if (!job || job.deletedAt) return undefined;
  const scope = libraryScope(job.sources, state.countries, state.provider);
  return job.snapshots.filter((v) => v.scope === scope).at(-1) ?? job.snapshots.at(-1);
}
export interface LibraryPageSummary {
  id: string;
  pageName: string;
  pagePictureUrl?: string;
  pagePictureKey?: string;
  url: string;
  adCount: number;
  firstSeenDay: number;
  firstSeenAt: string;
  lastSeenDay: number;
  lastSeenAt: string;
  change: 'baseline' | 'new' | 'returned' | 'existing' | 'missing';
}
function libraryPageSummaries(
  job: Pick<LibraryJob, 'snapshots'>,
  snapshot: LibrarySnapshot,
): LibraryPageSummary[] {
  const readings = job.snapshots
    .filter((v) => v.scope === snapshot.scope && v.day <= snapshot.day)
    .sort((a, b) => a.day - b.day);
  const previous = readings.filter((v) => v.day < snapshot.day).at(-1);
  const previousPages = new Set(previous?.ads.map((a) => a.pageId));
  const firstSeen = new Map<
    string,
    {
      day: number;
      at: string;
      pageName: string;
      pagePictureUrl?: string;
      pagePictureKey?: string;
      lastDay: number;
      lastAt: string;
    }
  >();
  for (const reading of readings)
    for (const ad of reading.ads) {
      const old = firstSeen.get(ad.pageId);
      firstSeen.set(ad.pageId, {
        day: old?.day ?? reading.day,
        at: old?.at ?? reading.at,
        pageName: ad.pageName.trim() || old?.pageName || '',
        pagePictureUrl: ad.pagePictureUrl ?? old?.pagePictureUrl,
        pagePictureKey: ad.pagePictureKey ?? old?.pagePictureKey,
        lastDay: reading.day,
        lastAt: reading.at,
      });
    }
  const grouped = new Map<string, LibraryPageSummary>();
  const seen = new Set<string>();
  for (const ad of snapshot.ads) {
    if (seen.has(ad.id)) continue;
    seen.add(ad.id);
    const first = firstSeen.get(ad.pageId)!;
    const change =
      !previous || snapshot.baseline
        ? 'baseline'
        : previousPages.has(ad.pageId)
          ? 'existing'
          : first.day < snapshot.day
            ? 'returned'
            : 'new';
    const page = grouped.get(ad.pageId) ?? {
      id: ad.pageId,
      pageName: first.pageName,
      pagePictureUrl: first.pagePictureUrl,
      pagePictureKey: first.pagePictureKey,
      adCount: 0,
      firstSeenDay: first.day,
      firstSeenAt: first.at,
      lastSeenDay: first.lastDay,
      lastSeenAt: first.lastAt,
      change,
      url: `https://www.facebook.com/ads/library/?${new URLSearchParams({ active_status: 'active', ad_type: 'all', country: 'ALL', view_all_page_id: ad.pageId })}`,
    };
    if (!page.pageName && ad.pageName.trim()) page.pageName = ad.pageName.trim();
    if (ad.pagePictureUrl) page.pagePictureUrl = ad.pagePictureUrl;
    if (ad.pagePictureKey) page.pagePictureKey = ad.pagePictureKey;
    page.adCount++;
    grouped.set(ad.pageId, page);
  }
  for (const [id, first] of firstSeen)
    if (!grouped.has(id))
      grouped.set(id, {
        id,
        pageName: first.pageName,
        pagePictureUrl: first.pagePictureUrl,
        pagePictureKey: first.pagePictureKey,
        adCount: 0,
        firstSeenDay: first.day,
        firstSeenAt: first.at,
        lastSeenDay: first.lastDay,
        lastSeenAt: first.lastAt,
        change: 'missing',
        url: `https://www.facebook.com/ads/library/?${new URLSearchParams({ active_status: 'active', ad_type: 'all', country: 'ALL', view_all_page_id: id })}`,
      });
  return [...grouped.values()].sort((a, b) => b.adCount - a.adCount || a.id.localeCompare(b.id));
}
export function publicLibraryPages(state: LibraryState, id: string, offset: number) {
  const snapshot = latestLibrarySnapshot(state, id);
  if (!snapshot) return null;
  const all = libraryPageSummaries(state.jobs[id]!, snapshot);
  const pictures = new Map(
    state.jobs[id]!.partial?.ads.filter((ad) => ad.pagePictureUrl).map((ad) => [
      ad.pageId,
      ad.pagePictureUrl,
    ]),
  );
  const pages = all
    .slice(offset, offset + 50)
    .map((page) => ({ ...page, pagePictureUrl: pictures.get(page.id) ?? page.pagePictureUrl }));
  return {
    at: snapshot.at,
    pages,
    total: all.length,
    offset,
    nextOffset: offset + pages.length < all.length ? offset + pages.length : null,
  };
}
export function publicLibraryAds(
  state: LibraryState,
  id: string,
  offset: number,
  highlights = false,
  creativeFilter?: CreativeStatus | 'all-new',
  grouped = false,
) {
  const snapshot = latestLibrarySnapshot(state, id);
  if (!snapshot) return null;
  const creative = analyzeSpyCreatives(state.jobs[id]!.snapshots, snapshot);
  const earlier = new Set(
    state.jobs[id]!.snapshots.filter(
      (v) => v.scope === snapshot.scope && v.day < snapshot.day,
    ).flatMap((v) => v.ads.map((a) => a.id)),
  );
  const added = new Set(snapshot.added);
  const groupCounts = new Map<string, Set<string>>();
  for (const ad of snapshot.ads) {
    const key = ad.collationId ?? ad.id;
    const ids = groupCounts.get(key) ?? new Set<string>();
    ids.add(ad.id);
    groupCounts.set(key, ids);
  }
  const isNew = (ad: LibraryAd) => !snapshot.baseline && added.has(ad.id) && !earlier.has(ad.id);
  const filtered = creativeFilter
    ? snapshot.ads.filter(
        (ad) =>
          creative.results.has(ad.id) &&
          (creativeFilter === 'all-new' || creative.results.get(ad.id)?.status === creativeFilter),
      )
    : snapshot.ads;
  const ordered = [...filtered].sort((a, b) =>
    highlights
      ? (b.collationCount ?? -1) - (a.collationCount ?? -1) || a.id.localeCompare(b.id)
      : Number(isNew(b)) - Number(isNew(a)),
  );
  const mediaGroups = new Map<string, LibraryAd[]>();
  const mediaKey = (ad: LibraryAd) =>
    ad.creativeComplete && ad.creativeAssets?.length && ad.creativeAssets.every((a) => a.sha256)
      ? ad.creativeAssets.map((a) => `${a.kind}:${a.sha256}`).join('|')
      : `id:${ad.id}`;
  for (const ad of ordered) {
    const key = mediaKey(ad);
    const members = mediaGroups.get(key) ?? [];
    members.push(ad);
    mediaGroups.set(key, members);
  }
  const display = grouped ? [...mediaGroups.values()].map((members) => members[0]!) : ordered;
  const seenGroups = new Set<string>();
  const selected = highlights
    ? ordered
        .filter((ad) => {
          const key = ad.collationId ?? ad.id;
          if (seenGroups.has(key)) return false;
          seenGroups.add(key);
          return true;
        })
        .slice(0, 12)
    : display.slice(offset, offset + 50);
  const previews = new Map(
    state.jobs[id]!.partial?.ads.filter((ad) => !creative.results.has(ad.id)).map((ad) => [
      ad.id,
      ad,
    ]),
  );
  const ads = selected.map((ad) => ({
    ...ad,
    creativeAnalysis: creative.results.get(ad.id),
    ...(grouped
      ? {
          relatedAds: mediaGroups.get(mediaKey(ad))!.map((member) => ({
            ...member,
            isNew: isNew(member),
            creativeAnalysis: creative.results.get(member.id),
          })),
        }
      : {}),
    activeGroupCount: groupCounts.get(ad.collationId ?? ad.id)!.size,
    ...(previews.get(ad.id)?.thumbnailKey
      ? { thumbnailKey: previews.get(ad.id)!.thumbnailKey }
      : {}),
    ...(previews.get(ad.id)?.thumbnailUrl
      ? { thumbnailUrl: previews.get(ad.id)!.thumbnailUrl }
      : {}),
    ...(previews.get(ad.id)?.title ? { title: previews.get(ad.id)!.title } : {}),
    ...(previews.get(ad.id)?.description ? { description: previews.get(ad.id)!.description } : {}),
    isNew: isNew(ad),
    isReturning: !snapshot.baseline && added.has(ad.id) && earlier.has(ad.id),
  }));
  return {
    at: snapshot.at,
    ads,
    total: grouped ? display.length : filtered.length,
    creativeSummary: creative.summary,
    offset,
    nextOffset: !highlights && offset + ads.length < display.length ? offset + ads.length : null,
  };
}
export function publicLibraryNewLinks(state: LibraryState, id: string) {
  const snapshot = latestLibrarySnapshot(state, id);
  if (!snapshot) return null;
  const { results } = analyzeSpyCreatives(state.jobs[id]!.snapshots, snapshot);
  return {
    at: snapshot.at,
    links: [...results.keys()].map((adId) => ({
      id: adId,
      url: `https://www.facebook.com/ads/library/?id=${encodeURIComponent(adId)}`,
    })),
  };
}
export type BrowserLibraryReader = (
  sources: string[],
  onProgress: (ads: LibraryAd[], pages: number, sourceIndex: number) => Promise<void>,
) => Promise<LibraryAd[]>;
export async function tickLibraryOwner(
  owner: string,
  options: {
    directory?: string;
    now?: Date;
    reader?: typeof readLibrary;
    browserReader?: BrowserLibraryReader;
    persistMedia?: (ads: LibraryAd[]) => Promise<LibraryAd[]>;
    fingerprintMedia?: (ads: LibraryAd[]) => Promise<void>;
    jobIds?: string[];
  } = {},
) {
  const dir = options.directory ?? spyLibraryDirectory();
  const now = options.now ?? new Date();
  let state = await changeLibraryState(
    owner,
    (s) => ({ ...s, heartbeatAt: now.toISOString() }),
    dir,
  );
  if (state.provider === 'scrapecreators' && !state.paidRequestsEnabled) return;
  if (
    state.provider !== 'browser' &&
    ['access_required', 'token_expired', 'credits_exhausted'].includes(state.connectionError)
  ) {
    await changeLibraryState(
      owner,
      (s) => ({
        ...s,
        jobs: Object.fromEntries(
          Object.entries(s.jobs).map(([id, j]) => [
            id,
            j.optedIn &&
            j.enabled &&
            !['complete', 'incomplete', 'source_missing'].includes(j.status)
              ? { ...j, status: 'blocked', error: s.connectionError, nextAt: null }
              : j,
          ]),
        ),
      }),
      dir,
    );
    return;
  }
  if (state.retryAfter && Date.parse(state.retryAfter) > now.getTime()) return;
  for (const job of Object.values(state.jobs)) {
    if (job.deletedAt) continue;
    if (options.jobIds && !options.jobIds.includes(job.id)) continue;
    if (
      !job.optedIn ||
      !job.enabled ||
      (job.status === 'blocked' && !job.nextAt) ||
      ['complete', 'paused', 'source_missing', 'incomplete'].includes(job.status) ||
      (job.nextAt && Date.parse(job.nextAt) > now.getTime())
    )
      continue;
    if (!state.encrypted && state.provider !== 'browser') {
      await changeLibraryState(
        owner,
        (s) => ({
          ...s,
          jobs: {
            ...s.jobs,
            [job.id]: {
              ...s.jobs[job.id]!,
              status: 'credentials_required',
              error: '',
              nextAt: new Date(now.getTime() + 3600000).toISOString(),
            },
          },
        }),
        dir,
      );
      continue;
    }
    if (job.startedAt && now.getTime() > Date.parse(job.startedAt) + 8 * day) {
      await changeLibraryState(
        owner,
        (s) => ({
          ...s,
          jobs: {
            ...s.jobs,
            [job.id]: {
              ...s.jobs[job.id]!,
              status: 'incomplete',
              error: 'cycle_incomplete',
              nextAt: null,
            },
          },
        }),
        dir,
      );
      continue;
    }
    const revision = state.revision;
    const sources = JSON.stringify(job.sources);
    const currentJob = (s: LibraryState) =>
      s.revision === revision &&
      s.jobs[job.id]?.enabled &&
      s.jobs[job.id]?.optedIn &&
      JSON.stringify(s.jobs[job.id]?.sources) === sources;
    await changeLibraryState(
      owner,
      (s) =>
        currentJob(s)
          ? { ...s, jobs: { ...s.jobs, [job.id]: { ...s.jobs[job.id]!, status: 'collecting' } } }
          : s,
      dir,
    );
    try {
      const mediaTasks: Promise<unknown>[] = [];
      const queuedMedia = new Set<string>();
      const previousMedia = state.jobs[job.id]!.snapshots.flatMap((v) => v.ads);
      const token =
        state.provider === 'browser' ? '' : await decryptLibraryToken(state.encrypted!, dir);
      let ads: LibraryAd[];
      if (state.provider === 'browser') {
        if (!options.browserReader) throw new LibraryFailure('unavailable');
        ads = await options.browserReader(job.sources, async (ads, pages, sourceIndex) => {
          await changeLibraryState(
            owner,
            (s) =>
              currentJob(s)
                ? {
                    ...s,
                    jobs: {
                      ...s.jobs,
                      [job.id]: {
                        ...s.jobs[job.id]!,
                        partial: {
                          ads,
                          pages,
                          sourceIndex,
                          at: new Date().toISOString(),
                          cursor: '',
                          seenCursors: [],
                          creditsRemaining: s.creditsRemaining ?? 0,
                          revision,
                          scope: libraryScope(job.sources, state.countries, state.provider),
                        },
                      },
                    },
                  }
                : s,
            dir,
          );
        });
      } else if (state.provider === 'scrapecreators' && !options.reader) {
        const scope = libraryScope(job.sources, state.countries, state.provider);
        const checkpoint =
          job.partial &&
          job.partial.scope === scope &&
          job.partial.revision === revision &&
          Date.now() - Date.parse(job.partial.at) < 30 * 60000
            ? job.partial
            : undefined;
        const result = await readScrapeLibrary(
          token,
          job.sources,
          state.countries,
          fetch,
          async () => {
            await changeLibraryState(
              owner,
              (s) => {
                if (!currentJob(s)) throw new LibraryFailure('incomplete');
                if (
                  !s.paidRequestsEnabled ||
                  (!s.unlimitedRequests && !s.requestBudget) ||
                  s.creditsRemaining === 0
                )
                  throw new LibraryFailure('credits_exhausted');
                const plan = s.spendingPlan;
                const reservationDay = new Intl.DateTimeFormat('en-CA', {
                  timeZone: 'America/Sao_Paulo',
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                }).format(options.now ?? new Date());
                const dailyReserved =
                  plan?.reservationDay === reservationDay ? plan.dailyReserved : 0;
                if (!s.unlimitedRequests && plan && plan.reserved >= plan.creditLimit)
                  throw new LibraryFailure('credits_exhausted');
                if (!s.unlimitedRequests && plan && dailyReserved >= plan.dailyLimit)
                  throw new LibraryFailure('daily_budget');
                return {
                  ...s,
                  requestBudget: Math.max(0, s.requestBudget - 1),
                  spendingPlan: plan
                    ? {
                        ...plan,
                        reserved: plan.reserved + 1,
                        dailyReserved: dailyReserved + 1,
                        reservationDay,
                      }
                    : null,
                };
              },
              dir,
            );
          },
          checkpoint,
          async (progress) => {
            retainSpyMedia(progress.ads, previousMedia);
            if (options.persistMedia) {
              const pending = progress.ads.filter((ad) => {
                if (
                  !(ad.thumbnailUrl && !ad.thumbnailKey) &&
                  !(ad.pagePictureUrl && !ad.pagePictureKey)
                )
                  return false;
                const key = `${ad.id}:${ad.thumbnailUrl ?? ''}:${ad.pagePictureUrl ?? ''}`;
                if (queuedMedia.has(key)) return false;
                queuedMedia.add(key);
                return true;
              });
              if (pending.length)
                mediaTasks.push(options.persistMedia(pending).catch(() => undefined));
            }
            await changeLibraryState(
              owner,
              (s) =>
                currentJob(s)
                  ? {
                      ...s,
                      creditsRemaining: progress.creditsRemaining,
                      requestBudget: Math.min(s.requestBudget, progress.creditsRemaining),
                      jobs: {
                        ...s.jobs,
                        [job.id]: { ...s.jobs[job.id]!, partial: { ...progress, scope, revision } },
                      },
                    }
                  : s,
              dir,
            );
          },
        );
        ads = result.ads;
        await changeLibraryState(
          owner,
          (s) =>
            currentJob(s)
              ? {
                  ...s,
                  creditsRemaining: result.creditsRemaining,
                  requestBudget: Math.min(s.requestBudget, result.creditsRemaining),
                }
              : s,
          dir,
        );
      } else ads = await (options.reader ?? readLibrary)(token, job.sources, state.countries);
      ads = retainSpyMedia(ads, previousMedia);
      await Promise.all(mediaTasks);
      if (options.persistMedia) ads = await options.persistMedia(ads);
      if (options.fingerprintMedia) await options.fingerprintMedia(ads);
      const at = new Date().toISOString();
      const timestamp = options.now ? now.getTime() : Date.now();
      await changeLibraryState(
        owner,
        (s) => {
          if (!currentJob(s)) return s;
          const current = s.jobs[job.id]!;
          const startedAt = current.startedAt ?? new Date(timestamp).toISOString();
          const index = Math.min(7, Math.floor((timestamp - Date.parse(startedAt)) / day));
          const scope = libraryScope(job.sources, state.countries, state.provider);
          const previous = current.snapshots.filter((v) => v.day < index).at(-1);
          const delta = libraryDelta(previous, { scope, ads });
          // One valid snapshot per cycle day; manual refresh replaces only that day's view.
          const snapshots = [
            ...current.snapshots.filter((v) => v.day !== index),
            {
              day: index,
              at: options.now ? now.toISOString() : at,
              scope,
              countries: [
                ...new Set(
                  job.sources.flatMap((raw) => {
                    const source = normalizeLibrarySource(raw);
                    return state.provider !== 'meta'
                      ? source.country === 'ALL'
                        ? state.countries
                        : [source.country]
                      : libraryCountries(source, state.countries);
                  }),
                ),
              ],
              ads,
              ...delta,
            },
          ].sort((a, b) => a.day - b.day);
          const done = index === 7;
          const notice = spyDiscoveryNotice(
            s.discoveryNamespace || s.owner,
            current,
            snapshots.find((v) => v.day === index)!,
            s.notices,
          );
          return {
            ...s,
            notices: notice ? [...s.notices, notice] : s.notices,
            jobs: {
              ...s.jobs,
              [job.id]: {
                ...current,
                discoverySeen: spyDiscoverySeen(
                  s.discoveryNamespace || s.owner,
                  current,
                  snapshots.find((v) => v.day === index)!,
                ),
                startedAt,
                checkedAt: new Date(timestamp).toISOString(),
                snapshots,
                partial: null,
                status: done
                  ? snapshots.filter((v) => v.scope === scope).length === 8
                    ? 'complete'
                    : 'incomplete'
                  : 'active',
                error: '',
                nextAt: done
                  ? null
                  : new Date(Date.parse(startedAt) + (index + 1) * day).toISOString(),
              },
            },
          };
        },
        dir,
      );
    } catch (error) {
      const code = error instanceof LibraryFailure ? error.code : 'unavailable';
      await changeLibraryState(
        owner,
        (s) =>
          currentJob(s)
            ? {
                ...s,
                connectionError:
                  state.provider !== 'browser' &&
                  ['access_required', 'token_expired', 'credits_exhausted'].includes(code)
                    ? code
                    : s.connectionError,
                retryAfter:
                  code === 'rate_limited'
                    ? new Date(now.getTime() + 3600000).toISOString()
                    : s.retryAfter,
                jobs: {
                  ...s.jobs,
                  [job.id]: {
                    ...s.jobs[job.id]!,
                    status: 'blocked',
                    error: code,
                    checkedAt: new Date().toISOString(),
                    nextAt:
                      code === 'incomplete' && state.provider === 'meta'
                        ? null
                        : new Date(
                            now.getTime() +
                              (code === 'incomplete' && state.provider === 'scrapecreators'
                                ? 300000
                                : 3600000),
                          ).toISOString(),
                  },
                },
              }
            : s,
        dir,
      );
      if (
        state.provider !== 'browser' &&
        ['access_required', 'token_expired', 'rate_limited', 'credits_exhausted'].includes(code)
      )
        break;
    }
    state = await readLibraryState(owner, dir);
  }
}
export async function tickLibraryUsers(
  dir = spyLibraryDirectory(),
  browserReader?: BrowserLibraryReader,
) {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  for (const file of await readdir(dir)) {
    if (!/^[a-f0-9]{64}\.json$/.test(file)) continue;
    try {
      const state = stateSchema.parse(JSON.parse(await readFile(join(dir, file), 'utf8')));
      if (state.retryAfter && Date.parse(state.retryAfter) > Date.now()) continue;
      const ids = Object.values(state.jobs)
        .filter(
          (j) =>
            j.optedIn &&
            j.enabled &&
            (j.nextAt
              ? Date.parse(j.nextAt) <= Date.now()
              : ['waiting', 'prepared', 'credentials_required'].includes(j.status)),
        )
        .map((j) => j.id);
      let next = 0;
      await Promise.all(
        Array.from({ length: Math.min(8, ids.length) }, async () => {
          while (next < ids.length) {
            const id = ids[next++]!;
            await tickLibraryOwner(state.owner, {
              directory: dir,
              browserReader,
              jobIds: [id],
              persistMedia: (ads) => persistSpyMedia(dir, state.owner, ads),
              fingerprintMedia: async (ads) => {
                await hydrateSpyThumbnails(dir, state.owner, ads);
                await fingerprintSpyCreatives(dir, state.owner, ads, fetch);
              },
            });
          }
        }),
      );
    } catch {
      /* Keep persisted state and retry next sweep. */
    }
  }
}
