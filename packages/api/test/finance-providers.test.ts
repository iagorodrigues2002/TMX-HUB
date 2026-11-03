import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  financeBalances,
  financeHistory,
  financeProfiles,
  financeWindow,
  lootEntry,
  wiseEntry,
} from '../src/services/finance-providers.js';

describe('banking imports', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('imports 90 days once, then overlaps only the incremental watermark', () => {
    const now = new Date('2026-11-02T12:00:00Z');
    expect(financeWindow(null, now).start).toBe('2026-08-04T12:00:00.000Z');
    expect(financeWindow('2026-11-01T12:00:00Z', now).start).toBe('2026-10-30T12:00:00.000Z');
  });
  it('uses the ledger line identity, not the shared operation id', () => {
    const row = {
      id: 'operation',
      uniqueHashId: 'hash:1',
      transactionDate: '2026-10-01T00:00:00Z',
      executedAt: '2026-10-02T00:00:00Z',
      transactionType: 'buy',
      status: 'completed',
      assetReceived: 'USDC',
      amountReceived: '99.50',
    };
    expect(lootEntry(row)).toMatchObject({
      externalId: 'hash:1',
      operationId: 'operation',
      at: '2026-10-02T00:00:00.000Z',
      received: '99.50',
      receivedCurrency: 'USDC',
    });
    expect(() => lootEntry({ ...row, uniqueHashId: null })).toThrow();
  });
  it('preserves currency and direction without classifying transfers as profit', () => {
    expect(
      wiseEntry(
        {
          referenceNumber: 'TRANSFER-12',
          date: '2026-10-01T00:00:00Z',
          type: 'DEBIT',
          amount: { value: -12.5, currency: 'EUR' },
          details: { description: 'Transfer' },
        },
        '42',
      ),
    ).toMatchObject({
      externalId: '42:TRANSFER-12:DEBIT',
      sent: '12.5',
      sentCurrency: 'EUR',
      kind: 'DEBIT',
    });
  });
  it('fails closed on malformed dates and amounts', () => {
    expect(() =>
      wiseEntry(
        {
          referenceNumber: 'x',
          date: 'invalid',
          type: 'DEBIT',
          amount: { value: 1, currency: 'USD' },
        },
        '1',
      ),
    ).toThrow();
    expect(() =>
      lootEntry({
        uniqueHashId: 'x',
        transactionDate: '2026-10-01T00:00:00Z',
        amountReceived: 'NaN',
        assetReceived: 'USD',
      }),
    ).toThrow();
  });
  it('uses only read-only Loot MCP tools and does not present portfolio as cash', async () => {
    const calls: string[] = [];
    const fetch = vi.fn(async (_url: unknown, options: RequestInit) => {
      const body = JSON.parse(options.body as string);
      calls.push(body.params.name);
      expect(options.redirect).toBe('error');
      expect(options.headers).toMatchObject({ Authorization: 'Bearer synthetic-key' });
      const payload =
        body.params.name === 'getAccountHistory'
          ? { userId: 'owner-id' }
          : {
              totalUsdValue: '100',
              availableStableUsdValue: '20',
              lastFetchedAt: '2026-11-02T12:00:00Z',
              isStale: false,
            };
      return new Response(
        JSON.stringify({ result: { content: [{ type: 'text', text: JSON.stringify(payload) }] } }),
      );
    });
    vi.stubGlobal('fetch', fetch);
    expect(await financeProfiles('lootrush', 'synthetic-key')).toEqual([
      { id: 'owner-id', name: 'Conta LootRush' },
    ]);
    const balances = await financeBalances('lootrush', 'synthetic-key', 'owner-id');
    expect(balances.find((b) => b.id === 'available')?.amount).toBe('20');
    expect(balances.find((b) => b.id === 'portfolio')?.label).toContain('não somar');
    expect(calls).toEqual(['getAccountHistory', 'getAccountBalance']);
  });
  it('does not turn partial Loot balances into confirmed zero', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              result: {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify({
                      totalUsdValue: '0',
                      availableStableError: 'upstream failure',
                      tokenizedAssetsError: 'unavailable',
                    }),
                  },
                ],
              },
            }),
          ),
      ),
    );
    await expect(financeBalances('lootrush', 'synthetic-key', 'id')).rejects.toThrow(
      'balance_unavailable',
    );
  });
  it('imports a settled ledger with fixed hosts and rejects an estimated result set', async () => {
    const fetch = vi.fn(async (url: URL | string) => {
      expect(new URL(String(url)).origin).toBe('https://history-api.lootrush.com');
      return new Response(
        JSON.stringify({
          nodes: [],
          pageInfo: { currentPage: 0, hasNextPage: false, totalCountIsEstimate: true },
        }),
      );
    });
    vi.stubGlobal('fetch', fetch);
    await expect(
      financeHistory(
        'lootrush',
        'synthetic',
        'id',
        '2026-10-01T00:00:00Z',
        '2026-10-02T00:00:00Z',
        [],
      ),
    ).rejects.toThrow('history_incomplete');
  });
});
