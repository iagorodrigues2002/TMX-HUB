import { createHash } from 'node:crypto';
import { z } from 'zod';

export class LibraryFailure extends Error {
  constructor(
    public code:
      | 'access_required'
      | 'token_expired'
      | 'rate_limited'
      | 'unavailable'
      | 'incomplete'
      | 'credits_exhausted'
      | 'daily_budget'
      | 'invalid_source'
      | 'invalid_query',
    public metaCode?: number,
    public subcode?: number,
  ) {
    super(code);
  }
}
export interface LibrarySource {
  type: 'page' | 'keyword';
  value: string;
  country: string;
  exact: boolean;
}
export interface LibraryAd {
  isActive?: boolean;
  activityCheckedAt?: string;
  destinationDomains?: string[];
  creativeRecoveredAt?: string;
  creativeAssets?: { kind: 'image' | 'video'; url: string; sha256?: string }[];
  creativeComplete?: boolean;
  creativeText?: string;
  thumbnailDigest?: string;
  creativeAnalysis?: import('./spy-creative-analysis').CreativeAnalysis;
  relatedAds?: LibraryAd[];
  id: string;
  pageId: string;
  pageName: string;
  startedAt: string | null;
  url: string;
  thumbnailUrl?: string;
  title?: string;
  description?: string;
  collationCount?: number;
  collationId?: string;
  pagePictureUrl?: string;
  thumbnailKey?: string;
  pagePictureKey?: string;
  activeGroupCount?: number;
  detailsVersion?: 1;
  isNew?: boolean;
  isReturning?: boolean;
}
// ALL returned empty even for positive controls; use explicit commercial-coverage countries.
export const libraryCommercialCountries = [
  'AT',
  'BE',
  'BG',
  'HR',
  'CY',
  'CZ',
  'DK',
  'EE',
  'FI',
  'FR',
  'DE',
  'GR',
  'HU',
  'IE',
  'IT',
  'LV',
  'LT',
  'LU',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SK',
  'SI',
  'ES',
  'SE',
  'GB',
];
export function libraryCountries(source: LibrarySource, countries: string[]) {
  const selected = source.country === 'ALL' ? countries : [source.country];
  return [
    ...new Set(selected.flatMap((c) => (c === 'ALL' ? libraryCommercialCountries : [c]))),
  ].sort();
}
export function normalizeLibrarySource(raw: string): LibrarySource {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new LibraryFailure('invalid_source');
  }
  if (
    !['facebook.com', 'www.facebook.com'].includes(url.hostname) ||
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/ads/library/'
  )
    throw new LibraryFailure('invalid_source');
  if (url.searchParams.has('ad_type') && url.searchParams.get('ad_type') !== 'all')
    throw new LibraryFailure('invalid_source');
  if (
    url.searchParams.has('active_status') &&
    !['active', 'all'].includes(url.searchParams.get('active_status')!)
  )
    throw new LibraryFailure('invalid_source');
  const country = url.searchParams.get('country') ?? 'ALL';
  if (!/^(ALL|[A-Z]{2})$/.test(country)) throw new LibraryFailure('invalid_source');
  const page = url.searchParams.get('view_all_page_id');
  if (page) {
    if (!/^\d{1,30}$/.test(page)) throw new LibraryFailure('invalid_source');
    return { type: 'page', value: page, country, exact: false };
  }
  const q = url.searchParams.get('q')?.trim();
  if (!q || q.length > 100) throw new LibraryFailure('invalid_source');
  const quoted = q.startsWith('"') && q.endsWith('"');
  const value = quoted ? q.slice(1, -1) : q;
  if (!value.trim()) throw new LibraryFailure('invalid_source');
  return {
    type: 'keyword',
    value,
    country,
    exact: quoted || url.searchParams.get('search_type') === 'keyword_exact_phrase',
  };
}
export function libraryScope(sources: string[], countries: string[], provider = 'meta') {
  return createHash('sha256')
    .update(
      JSON.stringify({
        sources: [...new Set(sources.map((s) => JSON.stringify(normalizeLibrarySource(s))))].sort(),
        provider,
        countries:
          provider !== 'meta'
            ? countries
            : [
                ...new Set(
                  sources.flatMap((s) => libraryCountries(normalizeLibrarySource(s), countries)),
                ),
              ].sort(),
        status: 'ACTIVE',
        coverage: 'meta-library-api-v25-explicit-countries-v2',
      }),
    )
    .digest('hex');
}
const pageSchema = z.object({
  data: z.array(
    z.object({
      id: z.string().regex(/^\d+$/),
      page_id: z.string().regex(/^\d+$/),
      page_name: z.string().max(1000).optional(),
      ad_delivery_start_time: z.string().max(100).optional(),
    }),
  ),
  paging: z
    .object({
      next: z.string().optional(),
      cursors: z.object({ after: z.string().optional() }).optional(),
    })
    .optional(),
});
export async function readLibrary(
  token: string,
  sources: string[],
  countries: string[],
  fetcher: typeof fetch = fetch,
): Promise<LibraryAd[]> {
  if (
    !sources.length ||
    sources.length > 20 ||
    !countries.length ||
    countries.length > 30 ||
    countries.some((c) => !/^(ALL|[A-Z]{2})$/.test(c))
  )
    throw new LibraryFailure('invalid_source');
  const ads = new Map<string, LibraryAd>();
  const unique = new Map(
    sources.map((s) => {
      const v = normalizeLibrarySource(s);
      return [JSON.stringify(v), v];
    }),
  );
  for (const source of unique.values()) {
    let cursor = '';
    const seen = new Set<string>();
    let complete = false;
    for (let page = 0; page < 10; page++) {
      const url = new URL('https://graph.facebook.com/v25.0/ads_archive');
      url.search = new URLSearchParams({
        ad_type: 'ALL',
        ad_active_status: 'ACTIVE',
        ad_reached_countries: JSON.stringify(libraryCountries(source, countries)),
        fields: 'id,page_id,page_name,ad_delivery_start_time',
        limit: '500',
        ...(source.type === 'page'
          ? { search_page_ids: JSON.stringify([source.value]) }
          : {
              search_terms: source.value,
              search_type: source.exact ? 'KEYWORD_EXACT_PHRASE' : 'KEYWORD_UNORDERED',
            }),
        ...(cursor ? { after: cursor } : {}),
      }).toString();
      let response: Response;
      let body: unknown;
      try {
        response = await fetcher(url, {
          headers: { Authorization: `Bearer ${token}` },
          redirect: 'error',
          signal: AbortSignal.timeout(20000),
        });
        const text = await response.text();
        if (text.length > 4000000) throw new LibraryFailure('incomplete');
        body = JSON.parse(text);
      } catch (e) {
        if (e instanceof LibraryFailure) throw e;
        throw new LibraryFailure('unavailable');
      }
      const error = z
        .object({ error: z.object({ code: z.number(), error_subcode: z.number().optional() }) })
        .safeParse(body);
      if (error.success) {
        const { code, error_subcode } = error.data.error;
        throw new LibraryFailure(
          code === 10
            ? 'access_required'
            : code === 190
              ? 'token_expired'
              : code === 100
                ? 'invalid_query'
                : [4, 17, 32, 613].includes(code)
                  ? 'rate_limited'
                  : 'unavailable',
          code,
          error_subcode,
        );
      }
      const parsed = pageSchema.safeParse(body);
      if (!response.ok || !parsed.success) throw new LibraryFailure('unavailable');
      for (const row of parsed.data.data)
        ads.set(row.id, {
          id: row.id,
          isActive: true,
          activityCheckedAt: new Date().toISOString(),
          pageId: row.page_id,
          pageName: row.page_name ?? '',
          startedAt: row.ad_delivery_start_time ?? null,
          url: `https://www.facebook.com/ads/library/?id=${row.id}`,
        });
      if (!parsed.data.paging?.next) {
        complete = true;
        break;
      }
      const after = parsed.data.paging.cursors?.after;
      if (!after || after.length > 4096 || seen.has(after)) throw new LibraryFailure('incomplete');
      seen.add(after);
      cursor = after;
    }
    if (!complete) throw new LibraryFailure('incomplete');
  }
  return [...ads.values()];
}
export function libraryDelta(
  previous: { scope: string; ads: LibraryAd[] } | undefined,
  current: { scope: string; ads: LibraryAd[] },
) {
  if (!previous || previous.scope !== current.scope)
    return { added: [] as string[], missing: [] as string[], baseline: true };
  const old = new Set(previous.ads.map((a) => a.id));
  const now = new Set(current.ads.map((a) => a.id));
  return {
    added: [...now].filter((id) => !old.has(id)),
    missing: [...old].filter((id) => !now.has(id)),
    baseline: false,
  };
}
