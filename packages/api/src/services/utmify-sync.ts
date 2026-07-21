import type { AdSnapshot, DailySnapshot, Offer } from '@page-cloner/shared';
import type { Redis } from 'ioredis';
import type { OfferStore } from './offer-store.js';
import type { SnapshotStore } from './snapshot-store.js';
import type { IntradayStore } from './intraday-store.js';

const AUTH_URL = 'https://server.utmify.com.br/users/auth';
const SEARCH_URL = 'https://server.utmify.com.br/orders/search-objects';
const SYNC_INTERVAL_MS = 30 * 60 * 1000;
const LOCK_TTL_MS = 25 * 60 * 1000;

interface UtmifyResult {
  [key: string]: unknown;
  name?: unknown;
  spend?: unknown;
  revenue?: unknown;
  approvedOrdersCount?: unknown;
  initiateCheckout?: unknown;
  impressions?: unknown;
  inlineLinkClicks?: unknown;
  videoViews3Seconds?: unknown;
}

export interface SyncResult {
  offerId: string;
  syncedDays: number;
  ads: number;
  failedDays?: number;
  skipped?: boolean;
}

export class UtmifySyncService {
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly redis: Redis,
    private readonly offerStore: OfferStore,
    private readonly snapshotStore: SnapshotStore,
    private readonly intradayStore: IntradayStore,
    private readonly log: {
      info: (obj: unknown, msg?: string) => void;
      warn: (obj: unknown, msg?: string) => void;
    },
  ) {}

  start(): void {
    if (this.timer) return;
    const run = () =>
      void this.syncAll().catch((error) => this.log.warn({ error }, 'utmify sync cycle failed'));
    setTimeout(run, 5_000).unref();
    this.timer = setInterval(run, SYNC_INTERVAL_MS);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  async syncAll(): Promise<void> {
    const offers = await this.offerStore.listAll();
    for (const offer of offers.filter((item) => item.utmifyConfigured && item.dashboardId)) {
      try {
        await this.syncOffer(offer);
      } catch (error) {
        this.log.warn({ error, offerId: offer.id }, 'utmify offer sync failed');
      }
    }
  }

  async syncOffer(offer: Offer, full = false): Promise<SyncResult> {
    if (!offer.dashboardId) throw new Error('Dashboard ID da UTMify não configurado.');
    const credentials = await this.offerStore.getUtmifyCredentials(offer.id);
    if (!credentials) throw new Error('Credenciais da UTMify não configuradas.');

    const lockKey = `lock:utmify-sync:${offer.id}`;
    const lock = await this.redis.set(lockKey, String(process.pid), 'PX', LOCK_TTL_MS, 'NX');
    if (!lock) return { offerId: offer.id, syncedDays: 0, ads: 0, skipped: true };

    await this.offerStore.setSyncState(offer.id, { status: 'syncing' });
    try {
      const token = await authenticate(credentials.login, credentials.password);
      const days = buildDays(full || !offer.lastSyncAt ? 30 : 2);
      let ads = 0;
      let syncedDays = 0;
      const failures: Array<{ date: string; message: string }> = [];
      for (const date of days) {
        try {
          const results = await fetchAds(token, offer.dashboardId, date);
          const snapshot = toSnapshot(offer.id, date, results);
          ads += snapshot.ads?.length ?? 0;
          await this.snapshotStore.upsert(snapshot);
          await this.intradayStore.capture(offer.id, snapshot);
          syncedDays += 1;
        } catch (error) {
          failures.push({
            date,
            message: error instanceof Error ? error.message : 'Falha desconhecida.',
          });
        }
      }
      if (syncedDays === 0) {
        throw new Error(failures[0]?.message ?? 'Nenhuma janela foi sincronizada.');
      }
      const at = new Date().toISOString();
      const warning = failures.length
        ? `${failures.length} de ${days.length} dias falharam. Primeiro erro em ${failures[0]?.date}: ${failures[0]?.message}`
        : undefined;
      await this.offerStore.setSyncState(offer.id, {
        status: failures.length ? 'partial' : 'success',
        at,
        ...(warning ? { error: warning } : {}),
      });
      this.log.info(
        { offerId: offer.id, days: syncedDays, failedDays: failures.length, ads },
        'utmify offer synced',
      );
      return {
        offerId: offer.id,
        syncedDays,
        ads,
        ...(failures.length ? { failedDays: failures.length } : {}),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha desconhecida na UTMify.';
      await this.offerStore.setSyncState(offer.id, { status: 'error', error: message });
      throw error;
    } finally {
      await this.redis.del(lockKey);
    }
  }

  async inspectCapabilities(offer: Offer): Promise<{
    resultKeys: string[];
    accountFields: Array<Record<string, string | number | boolean>>;
  }> {
    if (!offer.dashboardId) throw new Error('Dashboard ID da UTMify não configurado.');
    const credentials = await this.offerStore.getUtmifyCredentials(offer.id);
    if (!credentials) throw new Error('Credenciais da UTMify não configuradas.');
    const token = await authenticate(credentials.login, credentials.password);
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const results = await fetchAds(token, offer.dashboardId, yesterday.toISOString().slice(0, 10));
    const resultKeys = [...new Set(results.flatMap((item) => Object.keys(item)))].sort();
    const accountFields = results.slice(0, 200).flatMap((item) => {
      const fields = Object.entries(item).filter(([key, value]) => {
        return /account|conta/i.test(key) && ['string', 'number', 'boolean'].includes(typeof value);
      });
      return fields.length ? [Object.fromEntries(fields) as Record<string, string | number | boolean>] : [];
    });
    const uniqueAccounts = [...new Map(accountFields.map((fields) => [JSON.stringify(fields), fields])).values()];
    return { resultKeys, accountFields: uniqueAccounts.slice(0, 25) };
  }
}

async function authenticate(login: string, password: string): Promise<string> {
  const response = await fetch(AUTH_URL, {
    headers: { authorization: `Basic ${Buffer.from(`${login}:${password}`).toString('base64')}` },
    signal: AbortSignal.timeout(20_000),
  });
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) throw new Error(`Login UTMify recusado (${response.status}).`);
  const auth = payload?.auth as Record<string, unknown> | undefined;
  const token = auth?.token ?? payload?.token ?? payload?.access_token;
  if (typeof token !== 'string' || !token)
    throw new Error('A UTMify não retornou um token válido.');
  return token.replace(/^Bearer\s+/i, '').trim();
}

async function fetchAds(token: string, dashboardId: string, date: string): Promise<UtmifyResult[]> {
  const from = new Date(`${date}T00:00:00.000Z`);
  const to = new Date(from);
  to.setUTCDate(to.getUTCDate() + 1);
  const cappedTo = to > new Date() ? new Date() : to;
  const response = await fetch(SEARCH_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify({
      level: 'ad',
      dateRange: { from: from.toISOString(), to: cappedTo.toISOString() },
      nameContains: null,
      productNames: null,
      orderBy: 'greater_profit',
      adObjectStatuses: null,
      metaAdAccountIds: null,
      dashboardId,
    }),
    signal: AbortSignal.timeout(45_000),
  });
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    const detail = errorDetail(payload);
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        `A UTMify autenticou o login, mas recusou o acesso à dashboard ${dashboardId} (${response.status}). Confirme se esse ID pertence à mesma conta.${detail ? ` Detalhe: ${detail}` : ''}`,
      );
    }
    throw new Error(`Consulta UTMify falhou (${response.status})${detail ? `: ${detail}` : '.'}`);
  }
  return Array.isArray(payload?.results) ? (payload.results as UtmifyResult[]) : [];
}

export function toSnapshot(offerId: string, date: string, results: UtmifyResult[]): DailySnapshot {
  const byName = new Map<string, AdSnapshot>();
  for (const item of results) {
    const name = String(item.name ?? '').trim();
    if (!name) continue;
    const current = byName.get(name) ?? {
      name,
      spend: 0,
      sales: 0,
      revenue: 0,
      ic: 0,
      impressions: 0,
      clicks: 0,
    };
    // The ad-level endpoint can repeat delivery metrics when the same ad is
    // split into multiple attribution/product rows. Revenue and orders are
    // additive, but summing delivery fields multiplies spend and traffic.
    current.spend = Math.max(current.spend, number(item.spend) / 100);
    current.sales += Math.max(0, Math.round(number(item.approvedOrdersCount)));
    current.revenue += number(item.revenue) / 100;
    current.ic = Math.max(current.ic, Math.max(0, Math.round(number(item.initiateCheckout))));
    current.impressions = Math.max(
      current.impressions ?? 0,
      Math.max(0, Math.round(number(item.impressions))),
    );
    current.clicks = Math.max(
      current.clicks ?? 0,
      Math.max(0, Math.round(number(item.inlineLinkClicks))),
    );
    const views = Math.max(0, number(item.videoViews3Seconds));
    current.hookRate = Math.max(current.hookRate ?? 0, views);
    byName.set(name, current);
  }
  const ads = [...byName.values()].map((ad) => ({
    ...ad,
    revenue: Math.max(0, ad.revenue),
    hookRate: ad.impressions ? (ad.hookRate ?? 0) / ad.impressions : 0,
    ctr: ad.impressions ? (ad.clicks ?? 0) / ad.impressions : 0,
  }));
  return {
    offerId,
    date,
    spend: ads.reduce((sum, ad) => sum + ad.spend, 0),
    sales: ads.reduce((sum, ad) => sum + ad.sales, 0),
    revenue: ads.reduce((sum, ad) => sum + ad.revenue, 0),
    ic: ads.reduce((sum, ad) => sum + ad.ic, 0),
    impressions: ads.reduce((sum, ad) => sum + (ad.impressions ?? 0), 0),
    clicks: ads.reduce((sum, ad) => sum + (ad.clicks ?? 0), 0),
    ads,
    updatedAt: new Date().toISOString(),
  };
}

function buildDays(count: number): string[] {
  const result: string[] = [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const day = new Date(today);
    day.setUTCDate(day.getUTCDate() - offset);
    result.push(day.toISOString().slice(0, 10));
  }
  return result;
}

function number(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? '0'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function errorDetail(payload: Record<string, unknown> | null): string {
  if (!payload) return '';
  for (const key of ['message', 'error', 'detail']) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 200);
  }
  try {
    return JSON.stringify(payload).slice(0, 300);
  } catch {
    return '';
  }
}
