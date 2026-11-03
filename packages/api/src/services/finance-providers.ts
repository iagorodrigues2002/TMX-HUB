import { z } from 'zod';

export type FinanceProvider = 'wise' | 'lootrush';
export type FinanceEntry = {
  externalId: string;
  operationId: string;
  at: string;
  kind: string;
  status: string;
  description: string;
  sent: string | null;
  sentCurrency: string | null;
  received: string | null;
  receivedCurrency: string | null;
};
export type FinanceBalance = {
  id: string;
  currency: string;
  amount: string;
  label: string;
  at: string;
  stale: boolean;
};
const record = z.record(z.unknown());
const identifier = z
  .union([z.string().min(1).max(200), z.number().int().nonnegative()])
  .transform(String);
const decimal = z
  .union([z.string(), z.number().finite()])
  .transform(String)
  .pipe(
    z
      .string()
      .regex(/^-?\d+(\.\d+)?$/)
      .max(80),
  );
const currency = z.string().regex(/^[A-Z0-9]{2,15}$/);
const date = z
  .string()
  .refine((s) => Number.isFinite(Date.parse(s)))
  .transform((s) => new Date(s).toISOString());
export class FinanceProviderError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}
export function financeWindow(cursor: string | null, now = new Date()) {
  return {
    start: new Date(
      cursor ? Date.parse(cursor) - 2 * 86400000 : now.getTime() - 90 * 86400000,
    ).toISOString(),
    end: now.toISOString(),
  };
}
export function lootEntry(value: unknown): FinanceEntry {
  const row = record.parse(value);
  return {
    externalId: identifier.parse(row.uniqueHashId),
    operationId: identifier.parse(row.id ?? row.uniqueHashId),
    at: date.parse(row.executedAt ?? row.transactionDate),
    kind: z.string().parse(row.transactionType ?? 'unknown'),
    status: z.string().parse(row.status ?? 'unknown'),
    description: z
      .string()
      .max(2000)
      .parse(row.description ?? ''),
    sent: row.amountSent == null ? null : decimal.parse(row.amountSent),
    sentCurrency: row.amountSent == null ? null : currency.parse(row.assetSent),
    received: row.amountReceived == null ? null : decimal.parse(row.amountReceived),
    receivedCurrency: row.amountReceived == null ? null : currency.parse(row.assetReceived),
  };
}
export function wiseEntry(value: unknown, balance: string): FinanceEntry {
  const row = z
    .object({
      referenceNumber: identifier,
      date,
      type: z.enum(['DEBIT', 'CREDIT']),
      amount: z.object({ value: decimal, currency }),
      details: z.object({ description: z.string().max(2000).optional() }).optional(),
    })
    .parse(value);
  const amount = row.amount.value.replace(/^-/, '');
  return {
    externalId: `${balance}:${row.referenceNumber}:${row.type}`,
    operationId: row.referenceNumber,
    at: row.date,
    kind: row.type,
    status: 'completed',
    description: row.details?.description ?? '',
    sent: row.type === 'DEBIT' ? amount : null,
    sentCurrency: row.type === 'DEBIT' ? row.amount.currency : null,
    received: row.type === 'CREDIT' ? amount : null,
    receivedCurrency: row.type === 'CREDIT' ? row.amount.currency : null,
  };
}

// Only these fixed read-only provider endpoints can receive a banking credential.
async function providerJson(url: string, key: string, body?: unknown): Promise<unknown> {
  const target = new URL(url);
  if (
    ![
      'https://api.wise.com',
      'https://history-api.lootrush.com',
      'https://mcp.lootrush.com',
    ].includes(target.origin)
  )
    throw new FinanceProviderError('invalid_host');
  for (let attempt = 0; attempt < 3; attempt++) {
    let response: Response;
    try {
      response = await fetch(target, {
        method: body ? 'POST' : 'GET',
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
        headers: {
          Authorization: `Bearer ${key}`,
          Accept:
            target.origin === 'https://mcp.lootrush.com'
              ? 'application/json, text/event-stream'
              : 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      throw new FinanceProviderError('network_unavailable');
    }
    if (response.status === 429 || response.status >= 500) {
      await response.body?.cancel();
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
        continue;
      }
    }
    if (!response.ok)
      throw new FinanceProviderError(
        response.status === 401
          ? 'invalid_key'
          : response.status === 403
            ? 'permission_required'
            : `provider_http_${response.status}`,
      );
    const text = await response.text();
    if (text.length > 5_000_000) throw new FinanceProviderError('response_too_large');
    try {
      if (
        target.origin === 'https://mcp.lootrush.com' &&
        response.headers.get('content-type')?.includes('text/event-stream')
      ) {
        for (const event of text.replace(/\r\n/g, '\n').split('\n\n')) {
          const data = event
            .split('\n')
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trimStart())
            .join('\n');
          if (!data) continue;
          const message = JSON.parse(data);
          if (message?.id === (body as { id?: unknown })?.id && (message.result || message.error))
            return message;
        }
        throw new FinanceProviderError('invalid_response');
      }
      return JSON.parse(text);
    } catch {
      throw new FinanceProviderError('invalid_response');
    }
  }
  throw new FinanceProviderError('provider_unavailable');
}
async function lootTool(
  key: string,
  name: 'getAccountBalance' | 'getAccountHistory',
  args: Record<string, unknown> = {},
) {
  const response = z
    .object({
      error: z.unknown().optional(),
      result: z
        .object({
          isError: z.boolean().optional(),
          content: z.array(z.object({ type: z.string(), text: z.string().optional() })),
        })
        .optional(),
    })
    .parse(
      await providerJson('https://mcp.lootrush.com/mcp', key, {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name, arguments: args },
      }),
    );
  if (response.error || response.result?.isError || !response.result)
    throw new FinanceProviderError('provider_tool_error');
  const text = response.result.content.find((part) => part.type === 'text')?.text;
  if (!text) throw new FinanceProviderError('invalid_response');
  try {
    return record.parse(JSON.parse(text));
  } catch {
    throw new FinanceProviderError('invalid_response');
  }
}
export async function financeProfiles(provider: FinanceProvider, key: string) {
  if (provider === 'wise') {
    const rows = z
      .array(
        z.object({
          id: identifier,
          type: z.string(),
          details: z
            .object({ name: z.string().optional(), firstName: z.string().optional() })
            .optional(),
        }),
      )
      .parse(await providerJson('https://api.wise.com/2026Q4/profiles', key));
    return rows.map((r) => ({ id: r.id, name: r.details?.name ?? r.details?.firstName ?? r.type }));
  }
  const result = await lootTool(key, 'getAccountHistory', {
    startDate: new Date(Date.now() - 86400000).toISOString(),
    endDate: new Date().toISOString(),
    limit: 1,
  });
  return [{ id: identifier.parse(result.userId), name: 'Conta LootRush' }];
}
export async function financeBalances(
  provider: FinanceProvider,
  key: string,
  profile: string,
): Promise<FinanceBalance[]> {
  const at = new Date().toISOString();
  if (provider === 'wise') {
    const rows = z
      .array(
        z.object({
          id: identifier,
          type: z.string(),
          amount: z.object({ value: decimal, currency }),
        }),
      )
      .parse(
        await providerJson(
          `https://api.wise.com/2026Q4/profiles/${encodeURIComponent(profile)}/balances?types=STANDARD,SAVINGS`,
          key,
        ),
      );
    return rows.map((r) => ({
      id: r.id,
      currency: r.amount.currency,
      amount: r.amount.value,
      label: r.type === 'STANDARD' ? 'Saldo em conta' : 'Reserva Wise',
      at,
      stale: false,
    }));
  }
  const row = await lootTool(key, 'getAccountBalance');
  const captured = row.lastFetchedAt ? date.parse(row.lastFetchedAt) : at;
  const stale = row.isStale !== false || !row.lastFetchedAt;
  const balances: FinanceBalance[] = [];
  // Portfolio total is not withdrawable cash; never label holdings or collateral as available.
  if (row.availableStableUsdValue != null && !row.availableStableError)
    balances.push({
      id: 'available',
      currency: 'USD',
      amount: decimal.parse(row.availableStableUsdValue),
      label: 'Stablecoins disponíveis (equivalente USD)',
      at: captured,
      stale,
    });
  if (row.totalUsdValue != null && !row.availableStableError && !row.tokenizedAssetsError)
    balances.push({
      id: 'portfolio',
      currency: 'USD',
      amount: decimal.parse(row.totalUsdValue),
      label: 'Patrimônio total (inclui stablecoins; não somar)',
      at: captured,
      stale,
    });
  if (!balances.length) throw new FinanceProviderError('balance_unavailable');
  return balances;
}
export async function financeHistory(
  provider: FinanceProvider,
  key: string,
  profile: string,
  start: string,
  end: string,
  balances: FinanceBalance[],
): Promise<FinanceEntry[]> {
  const rows: FinanceEntry[] = [];
  if (provider === 'wise') {
    for (const balance of balances) {
      const params = new URLSearchParams({
        currency: balance.currency,
        intervalStart: start,
        intervalEnd: end,
        type: 'COMPACT',
      });
      const result = z
        .object({ transactions: z.array(z.unknown()) })
        .parse(
          await providerJson(
            `https://api.wise.com/2026Q4/profiles/${encodeURIComponent(profile)}/balance-statements/${encodeURIComponent(balance.id)}/statement.json?${params}`,
            key,
          ),
        );
      rows.push(...result.transactions.map((row) => wiseEntry(row, balance.id)));
    }
    return rows;
  }
  const seenPages = new Set<string>();
  for (let page = 0; page < 100; page++) {
    if (page) await new Promise((resolve) => setTimeout(resolve, 1100));
    const params = new URLSearchParams({
      resource: 'account',
      feature: 'account',
      currentPage: String(page),
      pageSize: '200',
      startDate: start,
      endDate: end,
    });
    const result = z
      .object({
        nodes: z.array(z.unknown()),
        pageInfo: z.object({
          hasNextPage: z.boolean(),
          currentPage: z.number().int(),
          totalCountIsEstimate: z.boolean().optional(),
        }),
      })
      .parse(await providerJson(`https://history-api.lootrush.com/api/history?${params}`, key));
    if (result.pageInfo.currentPage !== page || result.pageInfo.totalCountIsEstimate)
      throw new FinanceProviderError('history_incomplete');
    const entries = result.nodes.map(lootEntry);
    const signature = JSON.stringify(entries.map((r) => r.externalId));
    if (seenPages.has(signature) || (result.pageInfo.hasNextPage && !entries.length))
      throw new FinanceProviderError('pagination_repeated');
    seenPages.add(signature);
    rows.push(...entries);
    if (!result.pageInfo.hasNextPage) return rows;
  }
  throw new FinanceProviderError('history_incomplete');
}
