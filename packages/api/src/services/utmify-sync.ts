import type { AdSnapshot, DailySnapshot, Offer } from '@page-cloner/shared';
import type { Redis } from 'ioredis';
import type { OfferStore } from './offer-store.js';
import type { SnapshotStore } from './snapshot-store.js';
import type { IntradayStore } from './intraday-store.js';
import { generateCampaignAnalysis } from './campaign-ai.js';

const AUTH_URL = 'https://server.utmify.com.br/users/auth';
const SEARCH_URL = 'https://server.utmify.com.br/orders/search-objects';
const SYNC_INTERVAL_MS = 30 * 60 * 1000;
const LOCK_TTL_MS = 25 * 60 * 1000;
const REPORT_TIME_ZONE = 'America/Sao_Paulo';

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

interface UtmifySearchResponse {
  results: UtmifyResult[];
  currency?: string;
}

interface UtmifyAuthSession {
  token: string;
  payload: Record<string, unknown>;
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
      const session = await authenticate(credentials.login, credentials.password);
      const days = buildDays(full || !offer.lastSyncAt ? 30 : 2);
      let ads = 0;
      let syncedDays = 0;
      let detectedCurrency = detectDashboardCurrency(session.payload, offer.dashboardId);
      const failures: Array<{ date: string; message: string }> = [];
      for (const date of days) {
        try {
          const response = await fetchAds(session.token, offer.dashboardId, date);
          detectedCurrency ??= response.currency;
          const snapshot = toSnapshot(offer.id, date, response.results);
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
      if (detectedCurrency && detectedCurrency !== offer.currency) {
        await this.offerStore.setCurrency(offer.id, detectedCurrency);
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
      await this.generateScheduledAnalysis(offer).catch((error) => {
        this.log.warn({ error, offerId: offer.id }, 'scheduled campaign analysis failed');
      });
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

  private async generateScheduledAnalysis(offer: Offer): Promise<void> {
    const config = await this.offerStore.getAiSecretConfig(offer.id);
    if (!config?.autoGenerate || config.scheduleHours.length === 0) return;
    const now = new Date();
    const local = new Intl.DateTimeFormat('en-CA', {
      timeZone: REPORT_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      local.find((item) => item.type === type)?.value ?? '';
    const hour = Number(part('hour'));
    if (!config.scheduleHours.includes(hour)) return;
    const localDay = `${part('year')}-${part('month')}-${part('day')}`;
    const history = await this.offerStore.listAiAnalyses(offer.id);
    const alreadyGenerated = history.some((item) => {
      const created = new Date(item.createdAt);
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: REPORT_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        hourCycle: 'h23',
      }).formatToParts(created);
      const value = (type: Intl.DateTimeFormatPartTypes) =>
        parts.find((entry) => entry.type === type)?.value ?? '';
      return (
        `${value('year')}-${value('month')}-${value('day')}` === localDay &&
        Number(value('hour')) === hour
      );
    });
    if (alreadyGenerated) return;
    const summary = await this.intradayStore.summary(offer.id, now);
    const analysis = await generateCampaignAnalysis({
      offer,
      summary,
      config,
      history,
      now,
    });
    await this.offerStore.addAiAnalysis(analysis);
  }

  async inspectCapabilities(offer: Offer): Promise<{
    resultKeys: string[];
    accountFields: Array<Record<string, string | number | boolean>>;
    currency?: string;
  }> {
    if (!offer.dashboardId) throw new Error('Dashboard ID da UTMify não configurado.');
    const credentials = await this.offerStore.getUtmifyCredentials(offer.id);
    if (!credentials) throw new Error('Credenciais da UTMify não configuradas.');
    const session = await authenticate(credentials.login, credentials.password);
    const yesterday = buildDays(2)[0]!;
    const response = await fetchAds(session.token, offer.dashboardId, yesterday);
    const results = response.results;
    const resultKeys = [...new Set(results.flatMap((item) => Object.keys(item)))].sort();
    const accountFields = results.slice(0, 200).flatMap((item) => {
      const fields = Object.entries(item).filter(([key, value]) => {
        return /account|conta/i.test(key) && ['string', 'number', 'boolean'].includes(typeof value);
      });
      return fields.length
        ? [Object.fromEntries(fields) as Record<string, string | number | boolean>]
        : [];
    });
    const uniqueAccounts = [
      ...new Map(accountFields.map((fields) => [JSON.stringify(fields), fields])).values(),
    ];
    return {
      resultKeys,
      accountFields: uniqueAccounts.slice(0, 25),
      currency: detectDashboardCurrency(session.payload, offer.dashboardId) ?? response.currency,
    };
  }
}

async function authenticate(login: string, password: string): Promise<UtmifyAuthSession> {
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
  return {
    token: token.replace(/^Bearer\s+/i, '').trim(),
    payload: payload ?? {},
  };
}

export function detectDashboardCurrency(payload: unknown, dashboardId: string): string | undefined {
  const visit = (value: unknown, depth: number): string | undefined => {
    if (depth > 8 || value === null || typeof value !== 'object') return undefined;
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = visit(item, depth + 1);
        if (found) return found;
      }
      return undefined;
    }
    const record = value as Record<string, unknown>;
    const id = record.id ?? record._id ?? record.dashboardId;
    if (String(id ?? '') === dashboardId) {
      return detectCurrency(record);
    }
    for (const child of Object.values(record)) {
      const found = visit(child, depth + 1);
      if (found) return found;
    }
    return undefined;
  };
  return visit(payload, 0);
}

async function fetchAds(
  token: string,
  dashboardId: string,
  date: string,
): Promise<UtmifySearchResponse> {
  const dateRange = saoPauloDayRange(date);
  const response = await fetch(SEARCH_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify({
      level: 'ad',
      dateRange,
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
  const currency = detectCurrency(payload);
  return {
    results: Array.isArray(payload?.results) ? (payload.results as UtmifyResult[]) : [],
    ...(currency ? { currency } : {}),
  };
}

export function detectCurrency(payload: unknown): string | undefined {
  const validCodes = new Set([
    'BRL',
    'USD',
    'EUR',
    'GBP',
    'CAD',
    'AUD',
    'MXN',
    'COP',
    'ARS',
    'CLP',
    'PEN',
    'PYG',
    'UYU',
  ]);
  const visit = (value: unknown, depth: number): string | undefined => {
    if (depth > 6 || value === null || typeof value !== 'object') return undefined;
    if (Array.isArray(value)) {
      for (const item of value.slice(0, 20)) {
        const found = visit(item, depth + 1);
        if (found) return found;
      }
      return undefined;
    }
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (/currency|moeda/i.test(key) && typeof item === 'string') {
        const code = item.trim().toUpperCase();
        if (validCodes.has(code)) return code;
      }
    }
    for (const item of Object.values(value as Record<string, unknown>)) {
      const found = visit(item, depth + 1);
      if (found) return found;
    }
    return undefined;
  };
  return visit(payload, 0);
}

export function toSnapshot(offerId: string, date: string, results: UtmifyResult[]): DailySnapshot {
  const byName = new Map<string, AdSnapshot>();
  for (const item of results) {
    const identity = canonicalAdIdentity(item.name);
    if (!identity || isIgnoredAdIdentity(identity.key)) continue;
    const current = byName.get(identity.key) ?? {
      name: identity.name,
      spend: 0,
      sales: 0,
      revenue: 0,
      ic: 0,
      impressions: 0,
      clicks: 0,
    };
    // Different ads can share the same visible name. Keep one row in the UI,
    // but accumulate every result returned by UTMify, as its dashboard does.
    current.spend += number(item.spend) / 100;
    current.sales += Math.max(0, Math.round(number(item.approvedOrdersCount)));
    current.revenue += number(item.revenue) / 100;
    current.ic += Math.max(0, Math.round(number(item.initiateCheckout)));
    current.impressions =
      (current.impressions ?? 0) + Math.max(0, Math.round(number(item.impressions)));
    current.clicks = (current.clicks ?? 0) + Math.max(0, Math.round(number(item.inlineLinkClicks)));
    const views = Math.max(0, number(item.videoViews3Seconds));
    current.hookRate = (current.hookRate ?? 0) + views;
    byName.set(identity.key, current);
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

export function canonicalAdIdentity(value: unknown): { key: string; name: string } | undefined {
  const original = String(value ?? '').trim();
  if (!original) return undefined;

  // Meta commonly appends a copy marker when an ad is duplicated. UTMify
  // returns both rows, so remove only an explicit trailing copy marker before
  // grouping. The metrics from every physical ad are still accumulated.
  const name =
    original
      .replace(/\s*(?:[-–—]\s*)?(?:\(\s*)?(?:c[oó]pia|copy)(?:\s+\d+)?(?:\s*\))?\s*$/iu, '')
      .replace(/[\s_-]*p\+g[\s_-]*cloaked\s*$/iu, '')
      .trim() || original;
  const key = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

  return { key, name };
}

export function isIgnoredAdIdentity(key: string): boolean {
  return key === 'novo anuncio de engajamento';
}

export function buildDays(count: number, now = new Date()): string[] {
  const result: string[] = [];
  const today = dateInTimeZone(now, REPORT_TIME_ZONE);
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    result.push(addIsoDays(today, -offset));
  }
  return result;
}

export function saoPauloDayRange(date: string, now = new Date()): { from: string; to: string } {
  const from = midnightInTimeZone(date, REPORT_TIME_ZONE);
  const to = midnightInTimeZone(addIsoDays(date, 1), REPORT_TIME_ZONE);
  const cappedTo = to > now ? now : to;
  return { from: from.toISOString(), to: cappedTo.toISOString() };
}

function dateInTimeZone(instant: Date, timeZone: string): string {
  const parts = zonedParts(instant, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function midnightInTimeZone(date: string, timeZone: string): Date {
  const [year, month, day] = parseIsoDate(date);
  const target = Date.UTC(year, month - 1, day);
  let instant = new Date(target);
  // Convert a wall-clock midnight to its UTC instant. Iterating also handles
  // historical daylight-saving offset changes without hard-coding UTC-3.
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const parts = zonedParts(instant, timeZone);
    const represented = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    instant = new Date(instant.getTime() + target - represented);
  }
  return instant;
}

function zonedParts(
  instant: Date,
  timeZone: string,
): Record<'year' | 'month' | 'day' | 'hour' | 'minute' | 'second', number> {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const values = Object.fromEntries(
    formatter
      .formatToParts(instant)
      .flatMap((part) => (part.type === 'literal' ? [] : [[part.type, Number(part.value)]])),
  );
  return values as Record<'year' | 'month' | 'day' | 'hour' | 'minute' | 'second', number>;
}

function addIsoDays(date: string, days: number): string {
  const [year, month, day] = parseIsoDate(date);
  const result = new Date(Date.UTC(year, month - 1, day + days));
  return result.toISOString().slice(0, 10);
}

function parseIsoDate(date: string): [number, number, number] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error(`Data invÃ¡lida: ${date}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
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
