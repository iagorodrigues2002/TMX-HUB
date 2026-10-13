import { saoPauloDayRange } from './utmify-sync.js';

export type AdsPlatform = 'meta' | 'google' | 'tiktok';
export const ADS_PLATFORMS: AdsPlatform[] = ['meta', 'google', 'tiktok'];
export type ProviderRow = Record<string, unknown>;
export type ProviderAccount = { id: string; name: string };
export type ProviderErrorDiagnostics = { responseKind: 'json' | 'non-json'; cloudflare: boolean; retryAfterSeconds?: number };
export class AdsProviderError extends Error {
  constructor(public readonly reason: string, public readonly status: number, public readonly diagnostics?: ProviderErrorDiagnostics) {
    super(`UTMify ${status}: ${reason}`);
  }
}
function record(v: unknown): ProviderRow | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? v as ProviderRow : null;
}
export function providerErrorCode(payload: unknown): string {
  const root = record(payload);
  if (!root) return 'UPSTREAM_NON_JSON';
  const error = record(root.error);
  for (const candidate of [root.reason, root.code, error?.reason, error?.code])
    if (typeof candidate === 'string' && /^[A-Z][A-Z0-9_]{0,99}$/.test(candidate)) return candidate;
  return 'UPSTREAM_ERROR';
}
/** Exact dashboard membership, never another dashboard's profiles/currency. */
export function providerDashboard(payload: unknown, id: string): ProviderRow | null {
  const visit = (v: unknown, depth: number): ProviderRow | null => {
    if (depth > 8 || !v || typeof v !== 'object') return null;
    if (Array.isArray(v)) {
      for (const child of v) { const found = visit(child, depth + 1); if (found) return found; }
      return null;
    }
    const r = v as ProviderRow;
    if (String(r.id ?? r._id ?? r.dashboardId ?? '') === id) return r;
    for (const child of Object.values(r)) { const found = visit(child, depth + 1); if (found) return found; }
    return null;
  };
  return visit(payload, 0);
}
export function accountsFromProfiles(dashboard: ProviderRow, platform: 'google' | 'tiktok'): ProviderAccount[] {
  const profiles = dashboard[platform === 'google' ? 'googleProfiles' : 'tikTokProfiles'];
  if (!Array.isArray(profiles)) throw new AdsProviderError('ACCOUNT_CATALOG_UNAVAILABLE', 502);
  const rows = profiles.flatMap(p => {
    const list = record(p)?.adAccounts;
    if (!Array.isArray(list)) throw new AdsProviderError('ACCOUNT_CATALOG_UNAVAILABLE', 502);
    return list;
  });
  return normalizeAccounts(rows);
}
export function normalizeAccounts(rows: unknown[]): ProviderAccount[] {
  const accounts = new Map<string, ProviderAccount>();
  for (const v of rows) {
    const r = record(v);
    // "enabled" is UTMify connection selection, not ad delivery status. Disabled
    // ad accounts can still have historical spend and must not be filtered by status.
    if (!r || r.enabled === false) continue;
    if (typeof r.id !== 'string' || !r.id) throw new AdsProviderError('ACCOUNT_ID_MISSING', 502);
    accounts.set(r.id, { id: r.id, name: typeof r.name === 'string' ? r.name : r.id });
  }
  return [...accounts.values()];
}
export async function listMetaAccounts(token: string, dashboardId: string): Promise<ProviderAccount[]> {
  const r = await request(token, '/dashboards/meta/ad-accounts/list', { dashboardId });
  if (!Array.isArray(r)) throw new AdsProviderError('ACCOUNT_CATALOG_UNAVAILABLE', 502);
  return normalizeAccounts(r);
}
async function request(token: string, path: string, body: ProviderRow): Promise<unknown> {
  const response = await fetch(`https://server.utmify.com.br${path}`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json; charset=UTF-8' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(45_000),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    // Whitelist machine codes; never expose upstream free text or tokens.
    const retryAfter = response.headers.get('retry-after');
    const seconds = retryAfter && /^\d{1,4}$/.test(retryAfter) && Number(retryAfter) <= 3600 ? Number(retryAfter) : undefined;
    throw new AdsProviderError(providerErrorCode(payload), response.status, {
      responseKind: payload && typeof payload === 'object' ? 'json' : 'non-json',
      cloudflare: response.headers.get('server')?.toLowerCase() === 'cloudflare',
      ...(seconds !== undefined ? { retryAfterSeconds: seconds } : {}),
    });
  }
  return payload;
}
export async function fetchProviderObjects(token: string, dashboardId: string, platform: AdsPlatform,
  accounts: string[], from: string, to = from, level: 'ad' | 'campaign' | 'adset' = 'ad'): Promise<ProviderRow[]> {
  if (!accounts.length) return [];
  const dateRange = { from: saoPauloDayRange(from).from, to: saoPauloDayRange(to).to };
  const common = { dashboardId, dateRange, nameContains: null, productNames: null };
  const body = platform === 'meta'
    ? { ...common, level, orderBy: 'greater_profit', adObjectStatuses: null, accountStatuses: null, metaAdAccountIds: accounts, campaignIds: null, adsetIds: null }
    : { ...common, level: level === 'adset' ? platform === 'google' ? 'adGroup' : 'adgroup' : level, status: null, adAccountIds: accounts, ...(platform === 'tiktok' ? { searchMode: 'NORMAL' } : {}) };
  const payload = record(await request(token, `/orders/search-objects${platform === 'meta' ? '' : '/' + platform}`, body));
  if (!Array.isArray(payload?.results) || payload.results.some(r => !record(r))) throw new AdsProviderError('RESULTS_CONTRACT_INVALID', 502);
  const limit = record(payload.tikTokSearchLimit);
  if (limit?.reached) throw new AdsProviderError('TIKTOK_SEARCH_LIMIT_REACHED', 429);
  return payload.results as ProviderRow[];
}
export function normalizeProviderAd(platform: AdsPlatform, row: ProviderRow, campaigns: ProviderRow[], adsets: ProviderRow[]): ProviderRow {
  const account = row.accountId ?? row.adAccountId;
  const campaignId = row.campaignId;
  const adsetId = row.adsetId ?? row.adGroupId ?? row.adgroupId;
  const find = (rows: ProviderRow[], id: unknown) => rows.filter(r =>
    String(r.id ?? '') === String(id ?? '') && String(r.accountId ?? r.adAccountId ?? '') === String(account ?? ''));
  const campaign = find(campaigns, campaignId);
  const adset = find(adsets, adsetId);
  if (typeof account !== 'string' || typeof campaignId !== 'string' || typeof (row.adId ?? row.id) !== 'string')
    throw new AdsProviderError('PHYSICAL_IDENTITY_MISSING', 502);
  return { ...row, platform, adAccountId: account, adId: row.adId ?? row.id, adsetId,
    campaignName: typeof row.campaignName === 'string' ? row.campaignName : campaign.length === 1 ? campaign[0]!.name : '',
    adsetName: typeof row.adsetName === 'string' ? row.adsetName : adset.length === 1 ? adset[0]!.name : '',
    provider_original: row };
}
