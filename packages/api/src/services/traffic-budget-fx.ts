import { randomUUID } from 'node:crypto';
import type { BudgetFx } from '@page-cloner/shared/budget-fx';
import type { Redis } from 'ioredis';
import { z } from 'zod';

export const BUDGET_FX_KEY = 'traffic-management-v1:fx';
const entry = z.object({
  bid: z.coerce.number().positive().finite(),
  timestamp: z.coerce.number().positive(),
});
const response = z.object({ USDBRL: entry, EURBRL: entry, GBPBRL: entry });
const fallbackResponse = z.object({
  result: z.literal('success'),
  base_code: z.literal('BRL'),
  time_last_update_unix: z.number().positive(),
  rates: z.object({ BRL: z.literal(1), USD: z.number().positive().finite(), EUR: z.number().positive().finite(), GBP: z.number().positive().finite() }),
});
export async function loadBudgetFx(redis: Redis, offline = false): Promise<BudgetFx> {
  const raw = await redis.get(BUDGET_FX_KEY);
  const cached = raw ? (JSON.parse(raw) as BudgetFx) : null;
  if (offline || (cached && Date.now() - Date.parse(cached.fetchedAt) < 60000)) {
    if (!cached) throw Error('Cotação indisponível. Aguarde a atualização.');
    return cached;
  }
  if (!(await redis.set(`${BUDGET_FX_KEY}:refresh`, '1', 'EX', 60, 'NX'))) {
    if (cached) return cached;
    throw Error('Cotação em atualização.');
  }
  try {
    let rates: BudgetFx['rates'];
    let quotedAt: string;
    try {
      const res = await fetch(
      'https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL,GBP-BRL',
      { signal: AbortSignal.timeout(6000) },
    );
    if (!res.ok) throw Error('Cotação indisponível.');
    const data = response.parse(await res.json());
      rates = { BRL: 1, USD: data.USDBRL.bid, EUR: data.EURBRL.bid, GBP: data.GBPBRL.bid };
      quotedAt = new Date(Math.min(data.USDBRL.timestamp, data.EURBRL.timestamp, data.GBPBRL.timestamp) * 1000).toISOString();
    } catch {
      // Railway shared outbound IPs can exhaust AwesomeAPI's quota.
      const res = await fetch('https://open.er-api.com/v6/latest/BRL', { signal: AbortSignal.timeout(6000) });
      if (!res.ok) throw Error('Cotação alternativa indisponível.');
      const data = fallbackResponse.parse(await res.json());
      rates = { BRL: 1, USD: 1 / data.rates.USD, EUR: 1 / data.rates.EUR, GBP: 1 / data.rates.GBP };
      quotedAt = new Date(data.time_last_update_unix * 1000).toISOString();
    }
    const quote: BudgetFx = {
      id: randomUUID(),
      fetchedAt: new Date().toISOString(),
      quotedAt,
      rates,
    };
    await redis.set(BUDGET_FX_KEY, JSON.stringify(quote), 'EX', 86400);
    await redis.set(`${BUDGET_FX_KEY}:${quote.id}`, JSON.stringify(quote), 'EX', 604800);
    return quote;
  } catch {
    if (cached) return cached;
    throw Error('Não foi possível obter a cotação do orçamento.');
  }
}
