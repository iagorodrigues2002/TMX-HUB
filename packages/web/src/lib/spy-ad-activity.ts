import type { LibraryAd } from './spy-library-reader';

type Reading = {
  at: string;
  scope: string;
  ads: LibraryAd[];
  activity?: Record<string, { isActive: boolean; checkedAt: string }>;
};

export function spyAdActivity(readings: Reading[], scope: string, id: string) {
  const latest = readings
    .filter((s) => s.scope === scope)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
    .at(-1);
  const ad = latest?.ads.find((a) => a.id === id);
  const explicit = latest?.activity?.[id];
  if (explicit)
    return {
      status: explicit.isActive ? 'active' : 'inactive',
      checkedAt: explicit.checkedAt,
    } as const;
  // Legacy snapshots contain only rows accepted by the provider's ACTIVE filter.
  return {
    status: ad ? (ad.isActive === false ? 'inactive' : 'active') : 'unknown',
    checkedAt: ad ? (ad.activityCheckedAt ?? latest!.at) : latest?.at,
  } as const;
}
