import { createHash } from 'node:crypto';
import {
  type AdsPlatform,
  AdsProviderError,
  type ProviderAccount,
  type ProviderRow,
  fetchProviderObjects,
} from './ads-utmify-provider.js';

export const ADS_START = '2026-08-01';

/** postgres DATE is a Date with the default driver parser, not a display string. */
export function adsCalendarDay(value: unknown): string {
  const day =
    value instanceof Date && Number.isFinite(value.getTime())
      ? value.toISOString().slice(0, 10)
      : typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)
        ? value.slice(0, 10)
        : '';
  const parsed = new Date(`${day}T00:00:00Z`);
  if (!day || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day)
    throw new AdsProviderError('CALENDAR_DATE_INVALID', 502);
  return day;
}

export function safeAdsImportError(error: unknown, phase: string): string {
  const auth =
    error &&
    typeof error === 'object' &&
    'authCode' in error &&
    typeof error.authCode === 'string' &&
    [
      'AUTH_HTTP_REJECTED',
      'AUTH_TOKEN_MISSING',
      'AUTH_TIMEOUT',
      'AUTH_ABORTED',
      'AUTH_NETWORK',
      'AUTH_UNEXPECTED',
    ].includes(error.authCode)
      ? (error as { authCode: string; httpStatus?: number })
      : null;
  const code = auth
    ? auth.authCode
    : error instanceof AdsProviderError
      ? error.reason
      : error &&
          typeof error === 'object' &&
          'code' in error &&
          typeof error.code === 'string' &&
          /^[A-Z0-9]{5}$/.test(error.code)
        ? `DATABASE_${error.code}`
        : 'INTERNAL_ERROR';
  const status =
    auth && Number.isInteger(auth.httpStatus) && auth.httpStatus! >= 100 && auth.httpStatus! <= 599
      ? ` HTTP ${auth.httpStatus}`
      : error instanceof AdsProviderError
        ? ` HTTP ${error.status}`
        : '';
  const diagnostics =
    error instanceof AdsProviderError && error.diagnostics
      ? ` [${error.diagnostics.responseKind}; Cloudflare=${error.diagnostics.cloudflare}${error.diagnostics.retryAfterSeconds !== undefined ? `; retry_after=${error.diagnostics.retryAfterSeconds}s` : ''}]`
      : '';
  return `Importação pausada: ${code}${status} (${phase})${diagnostics}. Nenhuma nova tentativa automática.`;
}

export function adsRetryDelaySeconds(error: unknown, attempts: number): number | null {
  if (
    attempts >= 2 ||
    !(error instanceof AdsProviderError) ||
    error.reason === 'COULD_NOT_CONVERT_CURRENCY'
  )
    return null;
  const transport =
    error.origin === 'transport' && ['UPSTREAM_TIMEOUT', 'UPSTREAM_NETWORK'].includes(error.reason);
  const upstream =
    error.origin === 'upstream' &&
    ([429, 502, 503, 504].includes(error.status) ||
      (error.status === 500 && error.reason === 'UNKNOWN'));
  if (!transport && !upstream) return null;
  return Math.max(attempts === 0 ? 600 : 1800, error.diagnostics?.retryAfterSeconds ?? 0);
}

export function adsHierarchyWindowEnd(
  platform: AdsPlatform,
  day: string,
  rangeEnd: string,
): string {
  // Meta's observed production 400s occurred in weekly adset requests. A daily
  // request is the native UI-supported contract, verified with this dashboard.
  // Smaller batches are mitigation, not a claim of an upstream root cause.
  if (platform === 'meta') return day;
  const end = new Date(`${day}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 6);
  return end.toISOString().slice(0, 10) < rangeEnd ? end.toISOString().slice(0, 10) : rangeEnd;
}

export function adsTokens(value: string) {
  return (
    value
      .normalize('NFD')
      // biome-ignore lint/suspicious/noMisleadingCharacterClass: This range matches individual combining marks, not a combined character.
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
  );
}

export function logicalAd(name: string, adset = '', offerName = '') {
  let creative = adsTokens(name);
  const offerPrefix = adsTokens(offerName);
  if (offerPrefix && creative.startsWith(`${offerPrefix}_`))
    creative = creative.slice(offerPrefix.length + 1);
  const text = `${creative} ${adsTokens(adset)}`;
  const batches = [
    ...text.matchAll(/(?:^|[^A-Z0-9])(?:LEVA\s*|L)[\s_-]*0*(\d+)(?=$|[^0-9])/gi),
  ].map((m) => Number(m[1]));
  const unique = [...new Set(batches)];
  const adMatches = [...creative.matchAll(/(?:^|[^A-Z0-9])AD[\s_-]*0*(\d+)(?=$|[^0-9])/gi)];
  const ad = adMatches[0];
  if (unique.length > 1 || !ad || new Set(adMatches.map((m) => Number(m[1]))).size !== 1)
    return null;
  const variant = adsTokens(
    creative
      .replace(/(?:^|[^A-Z0-9])AD[\s_-]*0*\d+(?=$|[^0-9])/gi, ' ')
      .replace(/(?:^|[^A-Z0-9])(?:LEVA\s*|L)[\s_-]*0*\d+(?=$|[^0-9])/gi, ' ')
      .replace(/(?:^|_)(?:COPIA|COPY)(?:_\d+)?(?=$|_)/gi, '')
      // Provider file-format suffix, not a hook/avatar or creative variation.
      .replace(/(?:^|_)CREATIVE_MP4_?$/i, ''),
  );
  return {
    batch: `L${unique[0] ?? 1}`,
    ad: `AD${String(Number(ad[1])).padStart(2, '0')}`,
    variant,
  };
}

export function matchCampaign(campaign: string, offers: Array<{ id: string; name: string }>) {
  const token = `_${adsTokens(campaign)}_`;
  const matches = offers.filter((o) => token.includes(`_${adsTokens(o.name)}_`));
  const longest = Math.max(0, ...matches.map((o) => adsTokens(o.name).length));
  const winners = matches.filter((o) => adsTokens(o.name).length === longest);
  return winners.length === 1 ? winners[0]!.id : null;
}

export function stringField(raw: Record<string, unknown>, key: string): string {
  return typeof raw[key] === 'string' ? (raw[key] as string) : '';
}

/** Page identity is distinct from the ad account and landing-page metrics. */
export function advertiserPage(raw: Record<string, unknown>): {
  page_name: string;
  page_id: string;
} {
  const original =
    raw.provider_original &&
    typeof raw.provider_original === 'object' &&
    !Array.isArray(raw.provider_original)
      ? (raw.provider_original as Record<string, unknown>)
      : {};
  const explicit = (keys: string[], max: number) => {
    for (const source of [raw, original])
      for (const key of keys) {
        const value = source[key];
        if (typeof value === 'string' && value.trim() && value.trim().length <= max)
          return value.trim();
      }
    return '';
  };
  return {
    page_name: explicit(['pageName', 'page_name'], 256),
    page_id: explicit(['pageId', 'page_id'], 128),
  };
}

export function physicalKey(raw: Record<string, unknown>) {
  // Raw provider rows are retained. Never consolidate costs merely by visible ad name.
  const identity = [
    raw.platform ?? 'meta',
    raw.adAccountId ?? raw.accountId,
    raw.campaignId ?? raw.campaignName,
    raw.adsetId ?? raw.adsetName,
    raw.adId ?? raw.id,
    raw.name,
  ];
  return createHash('sha256').update(JSON.stringify(identity)).digest('hex');
}

export function nextImportRange(lastSync: string | Date | null, today: string) {
  const end = new Date(`${today}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() - 1);
  const start = lastSync ? new Date(`${today}T12:00:00Z`) : new Date(`${ADS_START}T12:00:00Z`);
  if (lastSync) {
    start.setUTCDate(start.getUTCDate() - 35);
    const last = new Date(lastSync);
    if (last < start) start.setTime(last.getTime());
  }
  return {
    from:
      start.toISOString().slice(0, 10) < ADS_START ? ADS_START : start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
  };
}

export type AccountFailure = {
  platform: AdsPlatform;
  account_id: string;
  account_name: string;
  reason: string;
  from: string;
  to: string;
};

/** Currency failures are isolated once per account per cycle, not retried in a loop.
 * Other errors (authentication, rate limits, contract changes) stop the import. */
export async function isolateProviderAccounts(
  token: string,
  dashboard: string,
  platform: AdsPlatform,
  accounts: ProviderAccount[],
  day: string,
  end: string,
  level: 'ad' | 'campaign' | 'adset' = 'ad',
  queryTo = day,
): Promise<{ accounts: ProviderAccount[]; rows: ProviderRow[]; failures: AccountFailure[] }> {
  if (!accounts.length) return { accounts: [], rows: [], failures: [] };
  if (accounts.length > 128) throw new AdsProviderError('ACCOUNT_CATALOG_LIMIT', 502);
  let probes = 0;
  const visit = async (
    group: ProviderAccount[],
  ): Promise<{ accounts: ProviderAccount[]; rows: ProviderRow[]; failures: AccountFailure[] }> => {
    if (++probes > 255) throw new AdsProviderError('ISOLATION_LIMIT', 502);
    try {
      return {
        accounts: group,
        rows: await fetchProviderObjects(
          token,
          dashboard,
          platform,
          group.map((a) => a.id),
          day,
          queryTo,
          level,
        ),
        failures: [],
      };
    } catch (e) {
      if (!(e instanceof AdsProviderError) || e.reason !== 'COULD_NOT_CONVERT_CURRENCY') throw e;
      if (group.length === 1)
        return {
          accounts: [],
          rows: [],
          failures: [
            {
              platform,
              account_id: group[0]!.id,
              account_name: group[0]!.name,
              reason: e.reason,
              from: day,
              to: end,
            },
          ],
        };
      const half = Math.ceil(group.length / 2);
      const a = await visit(group.slice(0, half));
      const b = await visit(group.slice(half));
      return {
        accounts: [...a.accounts, ...b.accounts],
        rows: [...a.rows, ...b.rows],
        failures: [...a.failures, ...b.failures],
      };
    }
  };
  return visit(accounts);
}
