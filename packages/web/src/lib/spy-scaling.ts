import { spyAdDomains } from './spy-domains';
import type { LibraryAd } from './spy-library-reader';

type Reading = { at: string; scope: string; ads: LibraryAd[] };
function identity(ad: LibraryAd) {
  const assets = ad.creativeAssets;
  if (ad.creativeComplete && assets?.length && assets.every((a) => a.sha256))
    return `media:${assets
      .map((a) => `${a.kind}:${a.sha256}`)
      .sort()
      .join('|')}`;
  return ad.collationId ? `group:${ad.pageId}:${ad.collationId}` : `ad:${ad.id}`;
}
function domains(ads: LibraryAd[]) {
  return [...new Set(ads.flatMap(spyAdDomains))].sort();
}
function grouped(ads: LibraryAd[]) {
  const groups = new Map<string, LibraryAd[]>();
  for (const ad of new Map(ads.map((a) => [a.id, a])).values()) {
    const key = identity(ad);
    groups.set(key, [...(groups.get(key) ?? []), ad]);
  }
  return groups;
}

/** Compare complete snapshots of the same search. IDs and media are separate metrics. */
export function spyScaling(readings: Reading[], scope: string, now = Date.now()) {
  const history = readings
    .filter((r) => r.scope === scope)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const latest = history.at(-1);
  if (!latest) return null;
  const previous = history.filter((r) => Date.parse(r.at) < Date.parse(latest.at)).at(-1);
  const stale = now - Date.parse(latest.at) > 36 * 3600000;
  const currentGroups = grouped(latest.ads);
  const previousGroups = grouped(previous?.ads ?? []);
  const previousIds = new Set(previous?.ads.map((a) => a.id));
  const activeAds = new Set(latest.ads.map((a) => a.id)).size;
  const delta = previous ? activeAds - previousIds.size : null;
  const rows = [...currentGroups]
    .map(([key, ads]) => {
      const prior = previousGroups.get(key);
      const growth = previous ? ads.length - (prior?.length ?? 0) : null;
      return {
        id: ads[0]!.id,
        key,
        title: ads[0]!.title || ads[0]!.pageName,
        url: ads[0]!.url,
        thumbnailKey: ads[0]!.thumbnailKey,
        activeAds: ads.length,
        previousAds: previous ? (prior?.length ?? 0) : null,
        delta: growth,
        signal: stale
          ? 'stale'
          : !previous
            ? 'insufficient'
            : !prior
              ? 'new'
              : growth! > 0
                ? 'growing'
                : 'stable',
        assets: new Set(ads.flatMap((a) => a.creativeAssets?.map((x) => x.sha256 ?? x.url) ?? []))
          .size,
        mediaConfirmed: key.startsWith('media:'),
        pages: [
          ...new Map(ads.map((a) => [a.pageId, { id: a.pageId, name: a.pageName }])).values(),
        ],
        domains: domains(ads),
      };
    })
    .sort(
      (a, b) =>
        Number(b.signal === 'growing') - Number(a.signal === 'growing') ||
        (b.delta ?? 0) - (a.delta ?? 0) ||
        b.activeAds - a.activeAds,
    );
  return {
    at: latest.at,
    previousAt: previous?.at ?? null,
    stale,
    activeAds,
    delta,
    pages: new Set(latest.ads.map((a) => a.pageId)).size,
    assets: new Set(
      latest.ads.flatMap((a) => a.creativeAssets?.map((x) => x.sha256 ?? x.url) ?? []),
    ).size,
    domains: domains(latest.ads),
    growing: rows.filter((r) => r.signal === 'growing').length,
    // IDs first observed in this reading are not proof of sustained scaling.
    rows: rows.slice(0, 100),
    totalGroups: rows.length,
  };
}
export type SpyScaling = NonNullable<ReturnType<typeof spyScaling>>;
