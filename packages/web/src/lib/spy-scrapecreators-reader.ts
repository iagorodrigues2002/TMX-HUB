import { createHash } from 'node:crypto';
import { z } from 'zod';
import { adPreview } from './spy-ad-preview';
import { type LibraryAd, LibraryFailure, normalizeLibrarySource } from './spy-library-reader';

const pageSchema = z.object({
  success: z.literal(true),
  credits_remaining: z.number().int().nonnegative(),
  credits_charged: z.literal(1).optional(),
  searchResults: z.array(
    z.object({
      ad_archive_id: z.string().regex(/^\d+$/),
      page_id: z.string().regex(/^\d+$/),
      page_name: z.string().max(1000),
      is_active: z.boolean(),
      start_date_string: z.string().max(100).nullish(),
      snapshot: z.unknown().optional(),
      collation_count: z.number().int().nonnegative().nullish(),
      collation_id: z.string().regex(/^\d+$/).nullish(),
    }),
  ),
  cursor: z.string().max(1000000).nullish(),
});
const companyPageSchema = pageSchema
  .omit({ searchResults: true })
  .extend({ results: pageSchema.shape.searchResults })
  .transform(({ results, ...meta }) => ({ ...meta, searchResults: results }));

export interface ScrapeCheckpoint {
  at: string;
  sourceIndex: number;
  cursor: string;
  seenCursors: string[];
  ads: LibraryAd[];
  pages: number;
  creditsRemaining: number;
}
const cursorKey = (value: string) => `sha256:${createHash('sha256').update(value).digest('hex')}`;

export async function readScrapeLibrary(
  key: string,
  sources: string[],
  countries: string[],
  fetcher: typeof fetch = fetch,
  beforeRequest: () => Promise<void> = async () => {},
  checkpoint?: ScrapeCheckpoint,
  onProgress: (checkpoint: ScrapeCheckpoint) => Promise<void> = async () => {},
) {
  if (
    !sources.length ||
    sources.length > 20 ||
    countries.length !== 1 ||
    !/^(ALL|[A-Z]{2})$/.test(countries[0] ?? '')
  )
    throw new LibraryFailure('invalid_source');
  const unique = new Map(
    sources.map((s) => {
      const source = normalizeLibrarySource(s);
      return [JSON.stringify(source), source];
    }),
  );
  const ads = new Map<string, LibraryAd>(checkpoint?.ads.map((ad) => [ad.id, ad]));
  let creditsRemaining = checkpoint?.creditsRemaining ?? 0;
  let pages = checkpoint?.pages ?? 0;
  const sourcesList = [...unique.values()];
  for (
    let sourceIndex = checkpoint?.sourceIndex ?? 0;
    sourceIndex < sourcesList.length;
    sourceIndex++
  ) {
    const source = sourcesList[sourceIndex]!;
    const resuming = sourceIndex === checkpoint?.sourceIndex;
    let cursor = resuming ? checkpoint.cursor : '';
    const seen = new Set<string>(
      resuming
        ? checkpoint.seenCursors.map((value) =>
            /^sha256:[a-f0-9]{64}$/.test(value) ? value : cursorKey(value),
          )
        : [],
    );
    let complete = false;
    for (let page = 0; page < 2000; page++) {
      await beforeRequest();
      const url = new URL(
        `https://api.scrapecreators.com/v1/facebook/adLibrary/${source.type === 'page' ? 'company/ads' : 'search/ads'}`,
      );
      const input = {
        country: source.country === 'ALL' ? countries[0]! : source.country,
        status: 'ACTIVE',
        ...(source.type === 'page'
          ? { pageId: source.value }
          : {
              query: source.value,
              search_type: source.exact ? 'keyword_exact_phrase' : 'keyword_unordered',
            }),
        ...(cursor ? { cursor } : {}),
      };
      let response: Response;
      let body: unknown;
      try {
        response = await fetcher(url, {
          method: 'POST',
          headers: { 'x-api-key': key, 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
          redirect: 'error',
          signal: AbortSignal.timeout(60000),
        });
        const text = await response.text();
        if (text.length > 4000000) throw new LibraryFailure('incomplete');
        body = JSON.parse(text);
      } catch (error) {
        if (error instanceof LibraryFailure) throw error;
        throw new LibraryFailure('unavailable');
      }
      if (!response.ok)
        throw new LibraryFailure(
          response.status === 402
            ? 'credits_exhausted'
            : [401, 403].includes(response.status)
              ? 'token_expired'
              : response.status === 429
                ? 'rate_limited'
                : 'unavailable',
        );
      const parsed = (source.type === 'page' ? companyPageSchema : pageSchema).safeParse(body);
      if (!parsed.success) throw new LibraryFailure('incomplete');
      creditsRemaining = parsed.data.credits_remaining;
      pages++;
      for (const row of parsed.data.searchResults) {
        if (!row.is_active) continue;
        ads.set(row.ad_archive_id, {
          id: row.ad_archive_id,
          detailsVersion: 1,
          pageId: row.page_id,
          pageName: row.page_name,
          startedAt: row.start_date_string ?? null,
          url: `https://www.facebook.com/ads/library/?id=${row.ad_archive_id}`,
          ...adPreview(row.snapshot),
          ...(row.collation_count ? { collationCount: row.collation_count } : {}),
          ...(row.collation_id ? { collationId: row.collation_id } : {}),
        });
      }
      const next = parsed.data.cursor;
      if (next && (!parsed.data.searchResults.length || seen.has(cursorKey(next))))
        throw new LibraryFailure('incomplete');
      if (next) seen.add(cursorKey(next));
      await onProgress({
        at: new Date().toISOString(),
        sourceIndex: next ? sourceIndex : sourceIndex + 1,
        cursor: next ?? '',
        seenCursors: next ? [...seen] : [],
        ads: [...ads.values()],
        pages,
        creditsRemaining,
      });
      if (!next) {
        complete = true;
        break;
      }
      if (!creditsRemaining) throw new LibraryFailure('credits_exhausted');
      cursor = next;
    }
    if (!complete) throw new LibraryFailure('incomplete');
  }
  return { ads: [...ads.values()], creditsRemaining };
}
