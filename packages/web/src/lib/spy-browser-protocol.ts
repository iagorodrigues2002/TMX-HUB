import type { LibraryAd } from './spy-library-reader';

export interface BrowserLibraryPage {
  ads: LibraryAd[];
  hasNext: boolean;
  cursor: string | null;
  estimate: number | null;
}
export function browserLibraryPages(payload: unknown): BrowserLibraryPage[] {
  const pages: BrowserLibraryPage[] = [];
  const stack = [payload];
  let visited = 0;
  while (stack.length) {
    if (++visited > 200000) throw Error('browser_payload_limit');
    const value = stack.pop();
    if (!value || typeof value !== 'object') continue;
    if (Array.isArray(value)) {
      stack.push(...value);
      continue;
    }
    const object = value as Record<string, unknown>;
    const connection = object.search_results_connection ?? object.searchResultsConnection;
    if (connection && typeof connection === 'object') {
      const c = connection as Record<string, unknown>;
      const info = (c.page_info ?? c.pageInfo) as Record<string, unknown> | undefined;
      const hasNext = info?.has_next_page ?? info?.hasNextPage;
      if (typeof hasNext !== 'boolean' || !Array.isArray(c.edges))
        throw Error('browser_incomplete');
      const cursor = info?.end_cursor ?? info?.endCursor;
      if (hasNext && (typeof cursor !== 'string' || !cursor)) throw Error('browser_incomplete');
      const ads: LibraryAd[] = [];
      for (const edge of c.edges as {
        node?: { collated_results?: unknown[]; collatedResults?: unknown[] };
      }[]) {
        const rows = edge?.node?.collated_results ?? edge?.node?.collatedResults;
        if (!Array.isArray(rows)) throw Error('browser_incomplete');
        for (const row of rows as Record<string, unknown>[]) {
          if (
            !row ||
            typeof row.ad_archive_id !== 'string' ||
            !/^\d+$/.test(row.ad_archive_id) ||
            typeof row.page_id !== 'string' ||
            !/^\d+$/.test(row.page_id) ||
            typeof row.is_active !== 'boolean'
          )
            throw Error('browser_incomplete');
          // Collated groups may contain inactive variants even with the active filter.
          if (!row.is_active) continue;
          ads.push({
            id: row.ad_archive_id,
            pageId: row.page_id,
            pageName: typeof row.page_name === 'string' ? row.page_name : '',
            startedAt:
              typeof row.start_date === 'number' && Number.isFinite(row.start_date)
                ? new Date(row.start_date * 1000).toISOString()
                : null,
            url: `https://www.facebook.com/ads/library/?id=${row.ad_archive_id}`,
          });
        }
      }
      pages.push({
        ads,
        hasNext,
        cursor: typeof cursor === 'string' ? cursor : null,
        estimate: typeof c.count === 'number' ? c.count : null,
      });
    }
    for (const child of Object.values(object))
      if (child && typeof child === 'object') stack.push(child);
  }
  return pages;
}
