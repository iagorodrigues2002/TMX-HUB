import { createHash } from 'node:crypto';
import type { LibraryAd } from './spy-library-reader';
import type { StructureRecord } from './spy-structure';

export const spyStructureAssetKey = (ad: LibraryAd) =>
  createHash('sha256')
    .update(JSON.stringify(ad.creativeAssets?.map((a) => [a.kind, a.sha256 ?? a.url]) ?? []))
    .digest('hex');

export function savedSpyStructure(records: StructureRecord[], ad: LibraryAd, history: LibraryAd[]) {
  const key = spyStructureAssetKey(ad);
  const text = (ad.creativeText ?? ad.description ?? '').slice(0, 6000);
  return records.find((r) => {
    if (r.assetKey !== key) return false;
    if (r.ads[0] === ad.id) return true;
    // Cross-ID reuse requires exact media bytes and the same analyzed copy.
    if (ad.creativeAssets?.length !== 1 || !ad.creativeAssets[0]?.sha256) return false;
    return history.some(
      (old) =>
        old.id === r.ads[0] &&
        spyStructureAssetKey(old) === key &&
        (old.creativeText ?? old.description ?? '').slice(0, 6000) === text,
    );
  });
}

export function savedSpyStructureSource(
  records: StructureRecord[],
  ad: LibraryAd,
  snapshots: { at: string; scope: string; ads: LibraryAd[] }[],
  selected: { at: string; scope: string },
) {
  const eligible = snapshots.filter(
    (s) => s.scope === selected.scope && Date.parse(s.at) <= Date.parse(selected.at),
  );
  const history = eligible.flatMap((s) => s.ads);
  const current = savedSpyStructure(records, ad, history);
  if (current) return { saved: current, source: ad, historicalAt: undefined };
  for (const snapshot of [...eligible].sort((a, b) => Date.parse(b.at) - Date.parse(a.at))) {
    const source = snapshot.ads.find((a) => a.id === ad.id);
    if (!source) continue;
    const saved = savedSpyStructure(records, source, history);
    if (saved) return { saved, source, historicalAt: snapshot.at };
  }
  return undefined;
}
