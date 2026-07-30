import type { Sql } from 'postgres';
import { logger } from '../lib/logger.js';

/**
 * Fetches and caches currency-to-BRL exchange rates.
 *
 * Primary source: open.er-api.com (free, no key, single call returns rates
 * from BRL to every listed currency, includes LATAM). Fallback: AwesomeAPI
 * (economia.awesomeapi.com.br), used when the primary is down.
 *
 * Rate cache lives in Postgres for up to 1 hour per pair; if a live fetch
 * fails, callers get the last stored rate (however old). If no rate has
 * ever been stored for a currency, the function returns null so callers
 * can flag the order for manual handling instead of silently converting
 * at a bad rate.
 *
 * We chose open.er-api.com over AwesomeAPI as the primary because Railway
 * shares outbound IPs across tenants and AwesomeAPI aggressively 429s
 * shared IPs.
 */

const CACHE_TTL_MS = 60 * 60 * 1000; // 1h
const FETCH_TIMEOUT_MS = 6_000;

type OpenErApiResponse = {
  result: 'success' | 'error';
  base_code?: string;
  rates?: Record<string, number>;
};
type AwesomeApiResponse = Record<string, { bid: string; code: string; codein: string }>;

/**
 * Fetches ALL known rates against BRL in one call, from the primary
 * (open.er-api.com). Rates come as BRL→X, we invert to X→BRL.
 */
async function fetchAllRatesPrimary(): Promise<Map<string, number>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch('https://open.er-api.com/v6/latest/BRL', {
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`open.er-api HTTP ${response.status}`);
    const data = (await response.json()) as OpenErApiResponse;
    if (data.result !== 'success') {
      throw new Error(`open.er-api result: ${data.result}`);
    }
    const rates = new Map<string, number>();
    for (const [code, brlPerCode] of Object.entries(data.rates ?? {})) {
      // API returns BRL→X. Invert for X→BRL.
      const value = Number(brlPerCode);
      if (Number.isFinite(value) && value > 0) {
        rates.set(code.toUpperCase(), 1 / value);
      }
    }
    return rates;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fallback source (AwesomeAPI). Used only if the primary fails. Fetches
 * only the specific currencies requested.
 */
async function fetchRatesFallback(currencies: string[]): Promise<Map<string, number>> {
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

async function fetchLiveRates(
  currencies: string[],
): Promise<{ rates: Map<string, number>; source: 'primary' | 'fallback'; error?: string }> {
  try {
    const rates = await fetchAllRatesPrimary();
    // Filter to just what was requested so callers don't accidentally
    // depend on codes we don't map.
    const filtered = new Map<string, number>();
    for (const code of currencies) {
      const rate = rates.get(code.toUpperCase());
      if (rate) filtered.set(code.toUpperCase(), rate);
    }
    return { rates: filtered, source: 'primary' };
  } catch (primaryError) {
    const primaryMsg =
      primaryError instanceof Error
        ? `${primaryError.name}: ${primaryError.message}`
        : String(primaryError);
    logger.warn({ error: primaryMsg }, 'primary exchange rate fetch failed, using fallback');
    try {
      const rates = await fetchRatesFallback(currencies);
      return { rates, source: 'fallback', error: primaryMsg };
    } catch (fallbackError) {
      const fallbackMsg =
        fallbackError instanceof Error
          ? `${fallbackError.name}: ${fallbackError.message}`
          : String(fallbackError);
      throw new Error(`primary(${primaryMsg}); fallback(${fallbackMsg})`);
    }
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
 * fresh cache hit (<1h); on stale/miss, tries to refresh live; on network
 * failure, falls back to the last-known cached rate. Returns null only if
 * the currency has never been observed and the network is currently down.
 */
export async function getBrlRate(currency: string, sql: Sql): Promise<number | null> {
  const code = currency.trim().toUpperCase();
  if (code === 'BRL') return 1;
  const cached = await readCachedRate(sql, code);
  if (cached && cached.age_ms < CACHE_TTL_MS) return cached.rate;
  try {
    const { rates } = await fetchLiveRates([code]);
    const rate = rates.get(code);
    if (rate) {
      await writeCachedRate(sql, code, rate);
      return rate;
    }
    logger.warn({ currency: code }, 'exchange rate: currency missing from live response');
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

/**
 * One-shot warmup: fetches every requested currency in a single call
 * against the primary provider (which returns them all together) and
 * writes them to the cache. Returns which succeeded, which failed, and
 * exposes any error message so ops can debug without shell access to the
 * pod.
 */
export async function warmupBrlRates(
  currencies: string[],
  sql: Sql,
): Promise<{
  cached: Record<string, number>;
  failed: string[];
  errors: string[];
  source: 'primary' | 'fallback' | 'none';
}> {
  const toFetch = currencies.map((c) => c.toUpperCase()).filter((c) => c !== 'BRL');
  if (toFetch.length === 0) return { cached: {}, failed: [], errors: [], source: 'none' };
  const cached: Record<string, number> = {};
  const failed: string[] = [];
  const errors: string[] = [];
  try {
    const { rates, source, error } = await fetchLiveRates(toFetch);
    if (error) errors.push(`primary failed: ${error}`);
    for (const code of toFetch) {
      const rate = rates.get(code);
      if (rate) {
        await writeCachedRate(sql, code, rate);
        cached[code] = rate;
      } else {
        failed.push(code);
        errors.push(`${code}: not returned by ${source}`);
      }
    }
    return { cached, failed, errors, source };
  } catch (error) {
    const errMsg = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    errors.push(`all providers failed: ${errMsg}`);
    logger.error({ error: errMsg }, 'exchange rate warmup failed on every provider');
    return { cached, failed: toFetch, errors, source: 'none' };
  }
}
