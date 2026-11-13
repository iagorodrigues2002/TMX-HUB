import type { LibraryAd } from './spy-library-reader';

export type CreativeStatus = 'new' | 'duplicate' | 'variation' | 'unverified';
export interface CreativeAnalysis {
  status: CreativeStatus;
  reason:
    | 'same_media_copy'
    | 'different_copy'
    | 'same_thumbnail'
    | 'same_group'
    | 'incomplete_history'
    | 'missing_media'
    | 'no_match'
    | 'baseline';
  previous?: { id: string; at: string; pageName: string; sameReading: boolean };
}
export interface CreativeSummary {
  total: number;
  new: number;
  duplicate: number;
  variation: number;
  unverified: number;
  candidates: number;
}
type Reading = { at: string; scope: string; baseline: boolean; ads: LibraryAd[]; added: string[] };
type Entry = { ad: LibraryAd; at: string };
const normalizeCopy = (value: string) => value.normalize('NFC').replace(/\s+/g, ' ').trim();
function mediaKey(ad: LibraryAd) {
  const assets = ad.creativeAssets;
  return ad.creativeComplete && assets?.length && assets.every((a) => a.sha256)
    ? assets.map((a) => `${a.kind}:${a.sha256}`).join('|')
    : undefined;
}

/** Historical evidence is scoped to this offer and collection scope, never other owners. */
export function analyzeSpyCreatives(readings: Reading[], snapshot: Reading) {
  const history = readings
    .filter((r) => r.scope === snapshot.scope && Date.parse(r.at) < Date.parse(snapshot.at))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const media = new Map<string, Entry>();
  const copies = new Map<string, Entry>();
  const thumbnails = new Map<string, Entry>();
  const groups = new Map<string, Entry>();
  const seen = new Set<string>();
  let incomplete = false;
  function remember(entry: Entry) {
    const { ad } = entry;
    const key = mediaKey(ad);
    if (key) {
      if (!media.has(key)) media.set(key, entry);
      if (ad.creativeText !== undefined) {
        const copy = `${key}:${normalizeCopy(ad.creativeText)}`;
        if (!copies.has(copy)) copies.set(copy, entry);
      }
    }
    if (ad.thumbnailDigest && !thumbnails.has(ad.thumbnailDigest))
      thumbnails.set(ad.thumbnailDigest, entry);
    if (ad.collationId && !groups.has(`${ad.pageId}:${ad.collationId}`))
      groups.set(`${ad.pageId}:${ad.collationId}`, entry);
  }
  for (const reading of history) {
    for (const ad of reading.ads) {
      seen.add(ad.id);
      if (!mediaKey(ad)) incomplete = true;
      remember({ ad, at: reading.at });
    }
  }
  const results = new Map<string, CreativeAnalysis>();
  const added = new Set(snapshot.added);
  const summary: CreativeSummary = {
    total: 0,
    new: 0,
    duplicate: 0,
    variation: 0,
    unverified: 0,
    candidates: 0,
  };
  // First-seen order is deterministic. Same-batch references are explicitly labelled.
  const ads = [...snapshot.ads].sort((a, b) => a.id.localeCompare(b.id));
  for (const ad of ads) {
    if (seen.has(ad.id) || snapshot.baseline || !added.has(ad.id)) continue;
    const key = mediaKey(ad);
    const exact =
      key && ad.creativeText !== undefined
        ? copies.get(`${key}:${normalizeCopy(ad.creativeText)}`)
        : undefined;
    const sameMedia = key ? media.get(key) : undefined;
    const thumbnail = ad.thumbnailDigest ? thumbnails.get(ad.thumbnailDigest) : undefined;
    const group = ad.collationId ? groups.get(`${ad.pageId}:${ad.collationId}`) : undefined;
    const previous = exact ?? sameMedia ?? thumbnail ?? group;
    let result: CreativeAnalysis;
    if (exact) result = { status: 'duplicate', reason: 'same_media_copy' };
    else if (sameMedia && sameMedia.ad.creativeText !== undefined && ad.creativeText !== undefined)
      result = { status: 'variation', reason: 'different_copy' };
    else if (thumbnail || group || sameMedia)
      result = {
        status: 'unverified',
        reason: thumbnail ? 'same_thumbnail' : group ? 'same_group' : 'missing_media',
      };
    else if (!key) result = { status: 'unverified', reason: 'missing_media' };
    else if (!history.length || incomplete)
      result = { status: 'unverified', reason: 'incomplete_history' };
    else result = { status: 'new', reason: 'no_match' };
    if (previous)
      result.previous = {
        id: previous.ad.id,
        at: previous.at,
        pageName: previous.ad.pageName,
        sameReading: previous.at === snapshot.at,
      };
    results.set(ad.id, result);
    summary.total++;
    summary[result.status]++;
    if (result.status === 'unverified' && previous) summary.candidates++;
    remember({ ad, at: snapshot.at });
  }
  return { results, summary };
}
