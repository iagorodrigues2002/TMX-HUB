import { z } from 'zod';
import {
  type CreativeDriveCatalog,
  type ImportedCreativeFile,
  creativeFileIdentity,
  driveFolderId,
} from './creative-drive-reader.js';
import {
  type CreativeStatus,
  creativeFallbackKey,
  creativeIdentity,
  creativeStatuses,
  isFinalCreativeStatus,
} from './creative-identity.js';

export const creativeAdReviewSchema = z.object({
  name: z.string().min(1).max(500),
  campaign: z.string().min(1).max(500),
  offer: z.string().regex(/^[A-Z0-9_]{1,80}$/),
  batch: z.string().regex(/^(Sem leva|Leva \d+)$/),
  fileId: z.string().regex(/^[A-Za-z0-9_-]{10,200}$/).optional(),
});
export type CreativeAdReview = z.infer<typeof creativeAdReviewSchema>;
export interface CreativeDriveState {
  rootUrl: string;
  requestedAt: number;
  catalog: CreativeDriveCatalog | null;
  error: string;
  checkedAt: number;
  metadata: Record<string, {
    status?: CreativeStatus | null;
    principalId?: string;
    manualStatus?: boolean;
    automaticRulesVersion?: number;
  }>;
  reviewedAds?: Record<string, CreativeAdReview>;
}

export const creativeDriveAction = z.discriminatedUnion('action', [
  z.object({ action: z.literal('configure'), rootUrl: z.string().url().max(1000) }).strict(),
  z.object({ action: z.literal('sync') }).strict(),
  z.object({
    action: z.literal('classify'),
    personal: z.boolean(),
    mappings: z.record(z.string().min(1).max(127), z.string().max(99)),
  }).strict(),
  z.object({
    action: z.literal('metadata'),
    key: z.string().min(1).max(2000),
    status: z.enum(creativeStatuses).nullable().optional(),
    principalId: z.string().regex(/^[A-Za-z0-9_-]{10,200}$/).optional(),
  }).strict().refine((v) => v.status !== undefined || !!v.principalId),
]);

const creativeArchiveSchema = z.object({
  rootId: z.string(),
  reviewedAds: z.record(z.string().regex(/^\d+$/), creativeAdReviewSchema).optional(),
  files: z.array(z.object({
    id: z.string().regex(/^[A-Za-z0-9_-]{10,200}$/),
    name: z.string().max(255).regex(/\.mp4$/i),
    offer: z.string(),
    leva: z.number().int().nonnegative().nullable(),
  })).max(2000),
});

export function withCreativeDriveArchive(state: CreativeDriveState, input: unknown) {
  if (!state.catalog || !state.rootUrl) return state;
  const archive = creativeArchiveSchema.safeParse(input);
  if (
    !archive.success ||
    archive.data.rootId !== driveFolderId(state.rootUrl) ||
    archive.data.rootId !== state.catalog.rootId
  )
    return state;
  const ids = new Set(state.catalog.files.map((file) => file.id));
  const offers = new Set(state.catalog.offers.map((offer) => offer.code));
  const historical: ImportedCreativeFile[] = [];
  for (const { id, name, offer, leva } of archive.data.files) {
    if (ids.has(id) || !offers.has(offer)) continue;
    const batch = leva === null ? 'Sem leva' : `Leva ${leva}`;
    const identity = leva === null ? null : creativeIdentity(name, offer, batch);
    if (leva !== null && !identity) continue;
    ids.add(id);
    historical.push({
      id, name, offer, batch, identity, archived: true, thumbnail: null,
      url: `https://drive.google.com/file/d/${id}/view`,
    });
  }
  return {
    ...state,
    catalog: { ...state.catalog, files: [...state.catalog.files, ...historical] },
    reviewedAds: archive.data.reviewedAds,
  };
}

export function applyManualCreativeMetadata(
  state: CreativeDriveState,
  key: string,
  patch: { status?: CreativeStatus | null; principalId?: string },
) {
  if (
    key.length > 2000 ||
    (!key.startsWith('unmatched:') && !/^[A-Za-z0-9_:.-]{1,200}$/.test(key)) ||
    (patch.status && !creativeStatuses.includes(patch.status))
  )
    throw Error('Criativo ou status inválido.');
  if (
    patch.principalId &&
    !state.catalog?.files.some(
      (file) =>
        file.id === patch.principalId &&
        (creativeFileIdentity(file)?.key ?? creativeFallbackKey(file.name, file.offer, file.batch)) === key,
    )
  )
    throw Error('O arquivo principal precisa pertencer a este criativo.');
  return {
    ...state.metadata,
    [key]: {
      ...state.metadata[key],
      ...patch,
      ...(patch.status !== undefined ? { manualStatus: true } : {}),
    },
  };
}

const AUTOMATIC_RULES_VERSION = 1;
export function applyCreativeStatuses(
  current: CreativeDriveState['metadata'],
  statuses: ReadonlyMap<string, CreativeStatus>,
) {
  let updated: CreativeDriveState['metadata'] | undefined;
  for (const [key, status] of statuses) {
    const saved = current[key];
    if (
      saved?.manualStatus ||
      saved?.status === null ||
      saved?.status === 'Em teste' ||
      (saved?.automaticRulesVersion === AUTOMATIC_RULES_VERSION &&
        (isFinalCreativeStatus(saved.status) || saved.status === status))
    )
      continue;
    updated ??= { ...current };
    updated[key] = { ...saved, status, automaticRulesVersion: AUTOMATIC_RULES_VERSION };
  }
  return updated;
}
