import type { Sql } from 'postgres';
import { logger } from '../lib/logger.js';

/**
 * Fetches and caches currency-to-BRL exchange rates.
 *
 * Uses AwesomeAPI (economia.awesomeapi.com.br) as the primary source: free,
 * no API key, quotes anchored on BRL, and returned in a single call for
 * multiple pairs. Rates are cached in Postgres for up to 1 hour per pair;
 * if a live fetch fails, callers get the last stored rate (however old).
 * If no rate has ever been stored for a currency, the function returns
 * null so callers can flag the order for manual handling instead of
 * silently converting at a bad rate.
 */

const CACHE_TTL_MS = 60 * 60 * 1000; // 1h
const FETCH_TIMEOUT_MS = 5_000;

// AwesomeAPI's endpoint returns keys like "USDBRL", "EURBRL" — flat.
type AwesomeApiResponse = Record<string, { bid: string; code: string; codein: string }>;

async function fetchLiveRates(currencies: string[]): Promise<Map<string, number>> {
  const pairs = currencies.map((c) => `${c}-BRL`).join(',');
  const url = `https://economia.awesomeapi.com.br/last/${pairs}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`AwesomeAPI HTTP ${response.status}`);
    const data = (await response.json()) as AwesomeApiResponse;
    const rates = new Map<string, number>();
    for (const key of Object.keys(data)) {
      const entry = data[key];
      const rate = Number(entry?.bid);
      if (entry?.code && Number.isFinite(rate) && rate > 0) {
        rates.set(entry.code.toUpperCase(), rate);
      }
    }
    return rates;
  } finally {
    clearTimeout(timeout);
  }
}

async function readCachedRate(
  sql: Sql,
  currency: string,
): Promise<{ rate: number; age_ms: number } | null> {
  const rows = await sql<{ rate: string; fetched_at: Date }[]>`
    SELECT rate::text, fetched_at
    FROM exchange_rate_cache
    WHERE base_currency = ${currency} AND target_currency = 'BRL'
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  const rate = Number(row.rate);
  if (!Number.isFinite(rate) || rate <= 0) return null;
  return { rate, age_ms: Date.now() - new Date(row.fetched_at).getTime() };
}

async function writeCachedRate(sql: Sql, currency: string, rate: number): Promise<void> {
  await sql`
    INSERT INTO exchange_rate_cache (base_currency, target_currency, rate, fetched_at)
    VALUES (${currency}, 'BRL', ${rate}, now())
    ON CONFLICT (base_currency, target_currency) DO UPDATE SET
      rate = EXCLUDED.rate, fetched_at = now()
  `;
}

/**
 * Returns the BRL exchange rate for `currency`. Identity for BRL. Prefers a
 * fresh cache hit (<1h); on stale/miss, tries to refresh from AwesomeAPI;
 * on network failure, falls back to the last-known cached rate. Returns
 * null only if the currency has never been observed and the network is
 * currently down.
 */
export async function getBrlRate(currency: string, sql: Sql): Promise<number | null> {
  const code = currency.trim().toUpperCase();
  if (code === 'BRL') return 1;
  const cached = await readCachedRate(sql, code);
  if (cached && cached.age_ms < CACHE_TTL_MS) return cached.rate;
  try {
    const fresh = await fetchLiveRates([code]);
    const rate = fresh.get(code);
    if (rate) {
      await writeCachedRate(sql, code, rate);
      return rate;
    }
    // Currency accepted by us but not returned by the API — fall back to
    // whatever we had.
    logger.warn({ currency: code }, 'exchange rate: currency missing from AwesomeAPI response');
    return cached?.rate ?? null;
  } catch (error) {
    logger.warn(
      { currency: code, error: error instanceof Error ? error.message : String(error) },
      'exchange rate fetch failed, falling back to cached rate',
    );
    return cached?.rate ?? null;
  }
}

/**
 * Converts a minor-unit amount in `currency` to BRL minor units, using the
 * live/cached rate. Returns null when no rate is available so the caller
 * can decide (skip, quarantine, retry later). Rounding is standard half-up.
 */
export async function convertToBrlMinor(
  amountMinor: number,
  currency: string,
  sql: Sql,
): Promise<{ brlMinor: number; rate: number } | null> {
  const rate = await getBrlRate(currency, sql);
  if (rate == null) return null;
  const brlMinor = Math.round(amountMinor * rate);
  return { brlMinor, rate };
}
