import { randomUUID } from 'node:crypto';
import type { DailySnapshot, Offer } from '@page-cloner/shared';
import type { Redis } from 'ioredis';
import type { Sql } from 'postgres';
import { generateCampaignAnalysis } from './campaign-ai.js';
import type { IntradayStore } from './intraday-store.js';
import type { OfferStore } from './offer-store.js';
import type { SnapshotStore } from './snapshot-store.js';
import { authenticate } from './utmify-auth.js';
import {
  REPORT_TIME_ZONE,
  buildDays,
  detectDashboardCurrency,
  fetchAds,
  saoPauloDayRange,
  toSnapshot,
} from './utmify-snapshot.js';
const SYNC_INTERVAL_MS = 30 * 60 * 1000;
const LOCK_TTL_MS = 25 * 60 * 1000;
const OFFER_SYNC_CONCURRENCY = 3;
const DAY_SYNC_CONCURRENCY = 3;

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
    private readonly db: Sql | null = null,
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
    const configured = offers.filter(
      (item) => item.utmifyAccessEnabled !== false && item.utmifyConfigured && item.dashboardId,
    );
    await mapWithConcurrency(configured, OFFER_SYNC_CONCURRENCY, async (offer) => {
      try {
        await this.syncOffer(offer);
      } catch (error) {
        this.log.warn({ error, offerId: offer.id }, 'utmify offer sync failed');
      }
    });
  }

  async syncOffer(offer: Offer, full = false): Promise<SyncResult> {
    if (offer.utmifyAccessEnabled === false)
      throw new Error('Acesso à dashboard UTMify desativado nesta oferta.');
    if (!offer.dashboardId) throw new Error('Dashboard ID da UTMify não configurado.');
    const dashboardId = offer.dashboardId;
    const credentials = await this.offerStore.getUtmifyCredentials(offer.id);
    if (!credentials) throw new Error('Credenciais da UTMify não configuradas.');

    const lockKey = `lock:utmify-sync:${offer.id}`;
    const lockToken = `${process.pid}:${randomUUID()}`;
    const lock = await this.redis.set(lockKey, lockToken, 'PX', LOCK_TTL_MS, 'NX');
    if (!lock) return { offerId: offer.id, syncedDays: 0, ads: 0, skipped: true };

    await this.offerStore.setSyncState(offer.id, { status: 'syncing' });
    try {
      const session = await authenticate(credentials.login, credentials.password);
      const days = buildDays(full || !offer.lastSyncAt ? 30 : 2);
      let ads = 0;
      let syncedDays = 0;
      let detectedCurrency = detectDashboardCurrency(session.payload, offer.dashboardId);
      const failures: Array<{ date: string; message: string }> = [];
      // UTMify's ad-level search endpoint only supports account/campaign/
      // adset/ad grouping, so it silently drops orders with no ad
      // attribution (e.g. upsells bought without a fresh ad click — UTMify's
      // own dashboard labels these "N/A" source). When Vendepay tracking is
      // also configured for this offer, it sees every paid order regardless
      // of attribution, so we use it to correct sales/revenue undercounts.
      const trackingProjectId =
        (offer.currency ?? 'BRL') === 'BRL' ? await this.findTrackingProjectId(offer.id) : null;
      await mapWithConcurrency(days, DAY_SYNC_CONCURRENCY, async (date) => {
        try {
          const response = await fetchAds(session.token, dashboardId, date);
          detectedCurrency ??= response.currency;
          let snapshot = toSnapshot(offer.id, date, response.results);
          if (trackingProjectId) {
            snapshot = await this.reconcileWithVendepay(trackingProjectId, date, snapshot);
          }
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
      });
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
      await releaseLock(this.redis, lockKey, lockToken);
    }
  }

  private async findTrackingProjectId(offerId: string): Promise<string | null> {
    if (!this.db) return null;
    try {
      const [project] = await this.db<{ id: string }[]>`
        SELECT id FROM tracking_projects WHERE offer_id = ${offerId} AND enabled = true
      `;
      return project?.id ?? null;
    } catch (error) {
      this.log.warn({ error, offerId }, 'utmify sync: tracking project lookup failed');
      return null;
    }
  }

  /**
   * Only ever adds coverage: overrides sales/revenue with the Vendepay total
   * for that day when it sees at least as many paid orders as UTMify's
   * ad-attributed count. If Vendepay reports fewer (e.g. tracking was only
   * enabled recently and has no history for that day), the UTMify numbers
   * are left untouched rather than downgraded.
   */
  private async reconcileWithVendepay(
    projectId: string,
    date: string,
    snapshot: DailySnapshot,
  ): Promise<DailySnapshot> {
    if (!this.db) return snapshot;
    try {
      const range = saoPauloDayRange(date);
      const [totals] = await this.db<{ orders: number; revenue_brl_minor: string }[]>`
        SELECT
          count(*)::int AS orders,
          COALESCE(sum(
            CASE
              WHEN amount_brl_minor IS NOT NULL THEN amount_brl_minor
              WHEN currency = 'BRL' THEN amount_minor
              ELSE 0
            END
          ), 0)::text AS revenue_brl_minor
        FROM tracking_orders
        WHERE project_id = ${projectId} AND status = 'paid'
          AND occurred_at >= ${range.from} AND occurred_at < ${range.to}
      `;
      if (!totals || totals.orders < snapshot.sales) return snapshot;
      return {
        ...snapshot,
        sales: totals.orders,
        revenue: Number(totals.revenue_brl_minor) / 100,
      };
    } catch (error) {
      this.log.warn({ error, projectId, date }, 'utmify sync: vendepay reconciliation failed');
      return snapshot;
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
    if (offer.utmifyAccessEnabled === false)
      throw new Error('Acesso à dashboard UTMify desativado nesta oferta.');
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

async function mapWithConcurrency<T>(
  values: T[],
  concurrency: number,
  task: (value: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const worker = async () => {
    while (cursor < values.length) {
      const value = values[cursor++];
      if (value === undefined) return;
      await task(value);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()));
}

async function releaseLock(redis: Redis, key: string, token: string): Promise<void> {
  await redis.eval(
    "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
    1,
    key,
    token,
  );
}

export { UtmifyAuthenticationError, authenticate } from './utmify-auth.js';

export {
  buildDays,
  canonicalAdIdentity,
  detectCurrency,
  detectDashboardCurrency,
  fetchAds,
  isIgnoredAdIdentity,
  saoPauloDayRange,
  toSnapshot,
} from './utmify-snapshot.js';
