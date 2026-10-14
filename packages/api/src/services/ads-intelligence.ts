import { createHash, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { env } from '../env.js';
import { decryptSecret } from '../lib/secret-box.js';
import { authenticate, detectDashboardCurrency } from './utmify-sync.js';
import { ADS_PLATFORMS, AdsProviderError, accountsFromProfiles, fetchProviderObjects, listMetaAccounts, normalizeProviderAd, providerDashboard, type AdsPlatform, type ProviderAccount, type ProviderRow } from './ads-utmify-provider.js';

export const ADS_START = '2026-08-01';
/** postgres DATE is a Date with the default driver parser, not a display string. */
export function adsCalendarDay(value: unknown): string {
  const day = value instanceof Date && Number.isFinite(value.getTime())
    ? value.toISOString().slice(0, 10)
    : typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)
      ? value.slice(0, 10) : '';
  const parsed = new Date(`${day}T00:00:00Z`);
  if (!day || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day)
    throw new AdsProviderError('CALENDAR_DATE_INVALID', 502);
  return day;
}
export function safeAdsImportError(error: unknown, phase: string): string {
  const auth = error && typeof error === 'object' && 'authCode' in error &&
    typeof error.authCode === 'string' && ['AUTH_HTTP_REJECTED','AUTH_TOKEN_MISSING','AUTH_TIMEOUT','AUTH_ABORTED','AUTH_NETWORK','AUTH_UNEXPECTED'].includes(error.authCode)
      ? error as { authCode: string; httpStatus?: number } : null;
  const code = auth ? auth.authCode : error instanceof AdsProviderError ? error.reason
    : error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' && /^[A-Z0-9]{5}$/.test(error.code)
      ? `DATABASE_${error.code}` : 'INTERNAL_ERROR';
  const status = auth && Number.isInteger(auth.httpStatus) && auth.httpStatus! >= 100 && auth.httpStatus! <= 599
    ? ` HTTP ${auth.httpStatus}` : error instanceof AdsProviderError ? ` HTTP ${error.status}` : '';
  const diagnostics = error instanceof AdsProviderError && error.diagnostics
    ? ` [${error.diagnostics.responseKind}; Cloudflare=${error.diagnostics.cloudflare}${error.diagnostics.retryAfterSeconds !== undefined ? `; retry_after=${error.diagnostics.retryAfterSeconds}s` : ''}]` : '';
  return `Importação pausada: ${code}${status} (${phase})${diagnostics}. Nenhuma nova tentativa automática.`;
}
export function adsRetryDelaySeconds(error: unknown, attempts: number): number | null {
  if(attempts>=2 || !(error instanceof AdsProviderError) || error.reason==='COULD_NOT_CONVERT_CURRENCY')return null;
  const transport=error.origin==='transport' && ['UPSTREAM_TIMEOUT','UPSTREAM_NETWORK'].includes(error.reason);
  const upstream=error.origin==='upstream' && ([429,502,503,504].includes(error.status) || (error.status===500 && error.reason==='UNKNOWN'));
  if(!transport&&!upstream)return null;
  return Math.max(attempts===0?600:1800,error.diagnostics?.retryAfterSeconds??0);
}
export function adsHierarchyWindowEnd(platform: AdsPlatform, day: string, rangeEnd: string): string {
  // Meta's observed production 400s occurred in weekly adset requests. A daily
  // request is the native UI-supported contract, verified with this dashboard.
  // Smaller batches are mitigation, not a claim of an upstream root cause.
  if (platform === 'meta') return day;
  const end = new Date(`${day}T12:00:00Z`); end.setUTCDate(end.getUTCDate() + 6);
  return end.toISOString().slice(0, 10) < rangeEnd ? end.toISOString().slice(0, 10) : rangeEnd;
}
export function adsTokens(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}
export function logicalAd(name: string, adset = '', offerName = '') {
  let creative = adsTokens(name);
  const offerPrefix = adsTokens(offerName);
  if (offerPrefix && creative.startsWith(`${offerPrefix}_`)) creative = creative.slice(offerPrefix.length + 1);
  const text = `${creative} ${adsTokens(adset)}`;
  const batches = [
    ...text.matchAll(/(?:^|[^A-Z0-9])(?:LEVA\s*|L)[\s_-]*0*(\d+)(?=$|[^0-9])/gi),
  ].map((m) => Number(m[1]));
  const unique = [...new Set(batches)];
  const adMatches = [...creative.matchAll(/(?:^|[^A-Z0-9])AD[\s_-]*0*(\d+)(?=$|[^0-9])/gi)];
  const ad = adMatches[0];
  if (unique.length > 1 || !ad || new Set(adMatches.map(m => Number(m[1]))).size !== 1) return null;
  const variant = adsTokens(
    creative
      .replace(/(?:^|[^A-Z0-9])AD[\s_-]*0*\d+(?=$|[^0-9])/gi, ' ')
      .replace(/(?:^|[^A-Z0-9])(?:LEVA\s*|L)[\s_-]*0*\d+(?=$|[^0-9])/gi, ' ')
      .replace(/(?:^|_)(?:COPIA|COPY)(?:_\d+)?(?=$|_)/gi, ''),
  );
  return { batch: `L${unique[0] ?? 1}`, ad: `AD${String(Number(ad[1])).padStart(2, '0')}`, variant };
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
export function advertiserPage(raw: Record<string, unknown>): {page_name:string;page_id:string} {
  const original = raw.provider_original && typeof raw.provider_original === 'object' && !Array.isArray(raw.provider_original)
    ? raw.provider_original as Record<string, unknown> : {};
  const explicit = (keys: string[], max: number) => {
    for (const source of [raw, original]) for (const key of keys) {
      const value = source[key];
      if (typeof value === 'string' && value.trim() && value.trim().length <= max) return value.trim();
    }
    return '';
  };
  return {page_name:explicit(['pageName','page_name'],256),page_id:explicit(['pageId','page_id'],128)};
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
export type AccountFailure = { platform: AdsPlatform; account_id: string; account_name: string; reason: string; from: string; to: string };
/** Currency failures are isolated once per account per cycle, not retried in a loop.
 * Other errors (authentication, rate limits, contract changes) stop the import. */
export async function isolateProviderAccounts(token: string, dashboard: string, platform: AdsPlatform,
  accounts: ProviderAccount[], day: string, end: string, level: 'ad' | 'campaign' | 'adset' = 'ad', queryTo = day): Promise<{ accounts: ProviderAccount[]; rows: ProviderRow[]; failures: AccountFailure[] }> {
  if (!accounts.length) return { accounts: [], rows: [], failures: [] };
  if (accounts.length > 128) throw new AdsProviderError('ACCOUNT_CATALOG_LIMIT', 502);
  let probes = 0;
  const visit = async (group: ProviderAccount[]): Promise<{ accounts: ProviderAccount[]; rows: ProviderRow[]; failures: AccountFailure[] }> => {
    if (++probes > 255) throw new AdsProviderError('ISOLATION_LIMIT', 502);
    try {
      return { accounts: group, rows: await fetchProviderObjects(token, dashboard, platform, group.map(a => a.id), day, queryTo, level), failures: [] };
    } catch (e) {
      if (!(e instanceof AdsProviderError) || e.reason !== 'COULD_NOT_CONVERT_CURRENCY') throw e;
      if (group.length === 1) return { accounts: [], rows: [], failures: [{ platform, account_id: group[0]!.id, account_name: group[0]!.name, reason: e.reason, from: day, to: end }] };
      const half = Math.ceil(group.length / 2);
      const a = await visit(group.slice(0, half));
      const b = await visit(group.slice(half));
      return { accounts: [...a.accounts, ...b.accounts], rows: [...a.rows, ...b.rows], failures: [...a.failures, ...b.failures] };
    }
  };
  return visit(accounts);
}
/** One authenticated import per week. Durable cursor; failures pause, never retry login automatically. */
export async function runAdsImport(app: Pick<FastifyInstance, 'db'>) {
  if (!app.db || !env.TRACKING_ENCRYPTION_KEY) return;
  const db = app.db;
  const leaseToken = randomUUID();
  const [connection] = await db`
    UPDATE ads_intelligence_connections SET lease_until=now()+interval '30 minutes',import_lease_token=${leaseToken},state='importing',next_sync_at=now()+interval '7 days',retry_attempts=CASE WHEN range_end IS NULL THEN 0 ELSE retry_attempts END
    WHERE owner_id=(SELECT owner_id FROM ads_intelligence_connections
      WHERE state IN ('ready','partial','retry_wait','importing') AND next_sync_at<=now()
        AND (lease_until IS NULL OR lease_until<now()) ORDER BY next_sync_at LIMIT 1 FOR UPDATE SKIP LOCKED)
    RETURNING *`;
  if (!connection) return;
  let phase = 'credentials';
  try {
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    phase = 'date_range';
    const range = connection.range_end
      ? {
          from: adsCalendarDay(connection.cursor_date),
          to: adsCalendarDay(connection.range_end),
        }
      : nextImportRange(connection.last_sync_at, today);
    if (range.from < ADS_START || range.to < range.from || range.to >= today)
      throw new AdsProviderError('HISTORICAL_RANGE_INVALID', 502);
    // If any previous cycle missed accounts, repair the whole retained historical
    // range when they recover. Never claim complete coverage over a persistent gap.
    if (!connection.range_end && Array.isArray(connection.account_failures) && connection.account_failures.length) range.from = ADS_START;
    phase = 'credentials';
    const credentials = JSON.parse(
      decryptSecret(connection.credentials_encrypted, env.TRACKING_ENCRYPTION_KEY),
    );
    phase = 'authentication';
    const session = await authenticate(credentials.login, credentials.password);
    const dashboard = providerDashboard(session.payload, connection.dashboard_id);
    const currency = detectDashboardCurrency(session.payload, connection.dashboard_id);
    if (!dashboard || currency !== 'BRL') throw new AdsProviderError('DASHBOARD_BRL_NOT_CONFIRMED', 502);
    await db`UPDATE ads_intelligence_connections SET state='importing',range_end=${range.to},cursor_date=${range.from},next_sync_at=now()+interval '7 days' WHERE owner_id=${connection.owner_id} AND import_lease_token=${leaseToken}`;
    const catalogs = new Map<AdsPlatform, ProviderAccount[]>();
    const failures: AccountFailure[] = [];
    const platforms: Array<{ platform: AdsPlatform; state: string; accounts: number }> = [];
    for (const platform of ADS_PLATFORMS) {
      phase = `catalog:${platform}`;
      try {
        catalogs.set(platform, platform === 'meta' ? await listMetaAccounts(session.token, connection.dashboard_id) : accountsFromProfiles(dashboard, platform));
      } catch (e) {
        if (!(e instanceof AdsProviderError) || e.reason !== 'ACCOUNT_CATALOG_UNAVAILABLE') throw e;
        catalogs.set(platform, []);
        failures.push({ platform, account_id: '', account_name: 'Catálogo não disponível', reason: e.reason, from: ADS_START, to: range.to });
      }
    }
    // A blocked account gets exactly one direct health check in a new weekly
    // cycle. Persistent errors do not trigger historical requests for it.
    for (const old of (Array.isArray(connection.account_failures) ? connection.account_failures : []) as AccountFailure[]) {
      const list = catalogs.get(old.platform);
      if (connection.range_end) {
        // Explicit continuation of the SAME interrupted weekly job: keep its
        // gaps and exclusion decisions, without rechecking blocked accounts or
        // restarting already committed August snapshots. A new weekly job
        // (range_end=NULL) performs health checks and historical repair.
        failures.push({ ...old, to: range.to });
        if (old.account_id) catalogs.set(old.platform, (list ?? []).filter(a => a.id !== old.account_id));
        continue;
      }
      const account = list?.find(a => a.id === old.account_id);
      if (!account) {
        // Disconnection does not erase an already recorded historical gap.
        // Empty IDs describe catalog errors, which discovery above re-evaluates.
        if (old.account_id) failures.push({ ...old, reason: 'ACCOUNT_NOT_IN_CATALOG', to: range.to });
        continue;
      }
      try {
        phase = `health:${old.platform}`;
        await fetchProviderObjects(session.token, connection.dashboard_id, old.platform, [account.id], old.from, old.from);
      } catch (e) {
        if (!(e instanceof AdsProviderError) || e.reason !== 'COULD_NOT_CONVERT_CURRENCY') throw e;
        failures.push({ ...old, to: range.to });
        catalogs.set(old.platform, list!.filter(a => a.id !== account.id));
      }
    }
    const metadata = new Map<AdsPlatform, { to: string; campaigns: ProviderRow[]; adsets: ProviderRow[] }>();
    const date = new Date(`${range.from}T12:00:00Z`);
    // All daily calls belong to a single weekly import, sequential and bounded.
    for (let count = 0; date.toISOString().slice(0, 10) <= range.to && count < 400; count++) {
      const day = date.toISOString().slice(0, 10);
      const daily: Array<{ platform: AdsPlatform; accounts: string[]; rows: ProviderRow[] }> = [];
      for (const platform of ADS_PLATFORMS) {
        phase = `ads:${platform}:${day}`;
        const selected = catalogs.get(platform)!;
        if (!selected.length) continue;
        // The first query also rechecks previously blocked accounts once this
        // weekly cycle; after failure they are excluded for the rest of the cycle.
        const isolated = await isolateProviderAccounts(session.token, connection.dashboard_id, platform, selected, day, range.to);
        catalogs.set(platform, isolated.accounts);
        if (isolated.failures.length) {
          failures.push(...isolated.failures);
          metadata.delete(platform);
        }
        if (!isolated.accounts.length) continue;
        let hierarchy = metadata.get(platform);
        if (!hierarchy || hierarchy.to < day) {
          const to = adsHierarchyWindowEnd(platform, day, range.to);
          phase = `hierarchy_campaign:${platform}:${day}`;
          const campaign = await isolateProviderAccounts(session.token, connection.dashboard_id, platform, isolated.accounts, day, range.to, 'campaign', to);
          phase = `hierarchy_adset:${platform}:${day}`;
          const adset = await isolateProviderAccounts(session.token, connection.dashboard_id, platform, campaign.accounts, day, range.to, 'adset', to);
          failures.push(...campaign.failures, ...adset.failures);
          catalogs.set(platform, adset.accounts);
          hierarchy = { to, campaigns: campaign.rows, adsets: adset.rows };
          metadata.set(platform, hierarchy);
        }
        const healthyIds = catalogs.get(platform)!.map(a => a.id);
        phase = `normalize:${platform}:${day}`;
        const rows = isolated.rows.filter(row => healthyIds.includes(String(row.accountId ?? row.adAccountId ?? ''))).map(row => normalizeProviderAd(platform, row, hierarchy!.campaigns, hierarchy!.adsets));
        const keys = rows.map(physicalKey);
        if (new Set(keys).size !== keys.length) throw new AdsProviderError('PHYSICAL_IDENTITY_DUPLICATED', 502);
        daily.push({ platform, accounts: healthyIds, rows });
      }
      phase = `persist:${day}`;
      await db.begin(async (sql) => {
        const [fence]=await sql`SELECT owner_id FROM ads_intelligence_connections WHERE owner_id=${connection.owner_id} AND import_lease_token=${leaseToken} FOR UPDATE`;
        if(!fence)throw new AdsProviderError('IMPORT_LEASE_LOST',409);
        for (const imported of daily) {
          // Replace only the healthy physical accounts. Never wipe another
          // platform, or previously retained costs of a now-blocked account.
          await sql`DELETE FROM ads_intelligence_daily WHERE owner_id=${connection.owner_id} AND day=${day}
            AND raw->>'platform'=${imported.platform} AND raw->>'adAccountId'=ANY(${imported.accounts})`;
          for (const row of imported.rows)
            await sql`INSERT INTO ads_intelligence_daily(owner_id,day,physical_key,raw,currency) VALUES(${connection.owner_id},${day},${physicalKey(row)},${sql.json(row as never)},${currency}) ON CONFLICT(owner_id,day,physical_key) DO UPDATE SET raw=EXCLUDED.raw,currency=EXCLUDED.currency,updated_at=now()`;
        }
        date.setUTCDate(date.getUTCDate() + 1);
        await sql`UPDATE ads_intelligence_connections SET cursor_date=${date.toISOString().slice(0, 10)},account_failures=${sql.json(failures as never)},coverage_from=COALESCE(coverage_from,${ADS_START}::date),coverage_to=GREATEST(coverage_to,${day}::date),coverage_complete=false,lease_until=now()+interval '30 minutes' WHERE owner_id=${connection.owner_id} AND import_lease_token=${leaseToken}`;
      });
    }
    if (date.toISOString().slice(0, 10) <= range.to)
      throw new Error('Importação excedeu limite seguro de dias.');
    for (const platform of ADS_PLATFORMS) platforms.push({ platform, state: failures.some(f => f.platform === platform) ? 'partial' : 'complete', accounts: catalogs.get(platform)!.length });
    const partial = failures.length > 0;
    await db`UPDATE ads_intelligence_connections SET state=${partial ? 'partial' : 'ready'},last_sync_at=now(),coverage_from=COALESCE(coverage_from,${ADS_START}::date),coverage_to=${range.to}::date,range_end=NULL,lease_until=NULL,coverage_complete=${!partial},account_failures=${db.json(failures as never)},platform_coverage=${db.json(platforms as never)},error=${partial ? 'Cobertura parcial: contas com falha estão identificadas. ROAS/ROI indisponíveis até reparar as lacunas.' : null} WHERE owner_id=${connection.owner_id} AND import_lease_token=${leaseToken}`;
  } catch (error) {
    // Never expose upstream bodies, account identities or credentials in logs/UI.
    const attempts=connection.range_end ? Number(connection.retry_attempts??0) : 0;
    const delay=adsRetryDelaySeconds(error,attempts);
    if(delay!==null){
      const message=safeAdsImportError(error,phase).replace('Importação pausada:','Importação aguardando recuperação:').replace('Nenhuma nova tentativa automática.',`Tentativa automática ${attempts+1}/2 em ${Math.ceil(delay/60)} minutos.`);
      await db`UPDATE ads_intelligence_connections SET state='retry_wait',lease_until=NULL,retry_attempts=${attempts+1},next_sync_at=now()+${delay}*interval '1 second',error=${message} WHERE owner_id=${connection.owner_id} AND import_lease_token=${leaseToken}`;
    }else await db`UPDATE ads_intelligence_connections SET state='paused',lease_until=NULL,error=${safeAdsImportError(error, phase)} WHERE owner_id=${connection.owner_id} AND import_lease_token=${leaseToken}`;
  }
}
