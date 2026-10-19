import { advertiserPage, stringField } from './ads-intelligence.js';

type Page = { page_name: string | null; page_id: string | null };
const unknownPage: Page = { page_name: null, page_id: null };
function uniquePage(values: Record<string, unknown>[]): Page {
  const pages = new Map<string, ReturnType<typeof advertiserPage>>();
  for (const value of values) {
    const page = advertiserPage(value);
    if (page.page_name || page.page_id) pages.set(JSON.stringify(page), page);
  }
  if (pages.size !== 1) return { ...unknownPage };
  const page = [...pages.values()][0]!;
  return { page_name: page.page_name || null, page_id: page.page_id || null };
}
/** Explicit journey metadata first; saved ad IDs only, never campaign-name inference. */
export function attributionPage(
  row: Record<string, unknown>,
  snapshots: Record<string, unknown>[],
): Page {
  const direct = Array.isArray(row.page_metadata)
    ? row.page_metadata.filter((value): value is Record<string, unknown> =>
        Boolean(value && typeof value === 'object' && !Array.isArray(value)),
      )
    : [];
  if (
    direct.some((value) => {
      const page = advertiserPage(value);
      return Boolean(page.page_name || page.page_id);
    })
  )
    return uniquePage(direct);
  const adId = stringField(row, 'ad_id');
  if (!adId) return { ...unknownPage };
  const source = stringField(row, 'source').toLowerCase();
  if (/google|youtube|tiktok|ttk/.test(source)) return { ...unknownPage };
  const campaignId = stringField(row, 'campaign_id');
  if (!['fb', 'facebook', 'meta', 'instagram', 'ig'].includes(source) && !campaignId)
    return { ...unknownPage };
  const candidates = snapshots.filter(
    (raw) =>
      (raw.platform ?? 'meta') === 'meta' &&
      stringField(raw, 'adId') === adId &&
      (!campaignId || stringField(raw, 'campaignId') === campaignId),
  );
  const accounts = new Set(candidates.map((raw) => stringField(raw, 'adAccountId')));
  if (accounts.size !== 1 || accounts.has('')) return { ...unknownPage };
  return uniquePage(candidates);
}
