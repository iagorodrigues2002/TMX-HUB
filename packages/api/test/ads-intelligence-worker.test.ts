import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/env.js', () => ({ env: { TRACKING_ENCRYPTION_KEY: 'test-secret' } }));
vi.mock('../src/services/utmify-sync.js', () => ({
  authenticate: vi.fn(),
  detectDashboardCurrency: () => 'BRL',
}));
vi.mock('../src/services/ads-utmify-provider.js', async () => ({
  ...(await vi.importActual('../src/services/ads-utmify-provider.js')),
  listMetaAccounts: vi.fn(),
  fetchProviderObjects: vi.fn(),
}));
import { encryptSecret } from '../src/lib/secret-box.js';
import {
  adsRetryDelaySeconds,
  isolateProviderAccounts,
  runAdsImport,
} from '../src/services/ads-intelligence.js';
import {
  AdsProviderError,
  fetchProviderObjects,
  listMetaAccounts,
} from '../src/services/ads-utmify-provider.js';
import { authenticate } from '../src/services/utmify-sync.js';
beforeEach(() => vi.clearAllMocks());
describe('durable weekly importer', () => {
  it('limits eligible errors to two retries per job, excluding auth/currency/400/contract failures', () => {
    const e = new AdsProviderError('UNKNOWN', 500, undefined, 'upstream');
    expect(adsRetryDelaySeconds(e, 0)).toBe(600);
    expect(adsRetryDelaySeconds(e, 1)).toBe(1800);
    expect(adsRetryDelaySeconds(e, 2)).toBeNull();
    expect(
      adsRetryDelaySeconds(new AdsProviderError('RESULTS_CONTRACT_INVALID', 502), 0),
    ).toBeNull();
    expect(
      adsRetryDelaySeconds(new AdsProviderError('UPSTREAM_ERROR', 400, undefined, 'upstream'), 0),
    ).toBeNull();
    expect(
      adsRetryDelaySeconds(
        new AdsProviderError('COULD_NOT_CONVERT_CURRENCY', 500, undefined, 'upstream'),
        0,
      ),
    ).toBeNull();
    expect(adsRetryDelaySeconds({ authCode: 'AUTH_TIMEOUT' }, 0)).toBeNull();
    expect(
      adsRetryDelaySeconds(
        new AdsProviderError(
          'RATE_LIMITED',
          429,
          { responseKind: 'json', cloudflare: true, retryAfterSeconds: 3600 },
          'upstream',
        ),
        0,
      ),
    ).toBe(3600);
    expect(
      adsRetryDelaySeconds(
        new AdsProviderError('UPSTREAM_TIMEOUT', 504, undefined, 'transport'),
        0,
      ),
    ).toBe(600);
  });
  it.each([1, 2])(
    'does not reset retry budget %s after a successful committed day',
    async (attempts) => {
      const conn = {
        owner_id: 'owner',
        dashboard_id: 'dash',
        credentials_encrypted: encryptSecret(
          JSON.stringify({ login: 'l', password: 'p' }),
          'test-secret',
        ),
        range_end: '2026-10-07',
        cursor_date: '2026-10-06',
        retry_attempts: attempts,
      };
      const db = vi
        .fn()
        .mockResolvedValueOnce([conn])
        .mockResolvedValue([{ owner_id: 'owner' }]);
      Object.assign(db, {
        begin: async <T>(fn: (tx: typeof db) => Promise<T>) => fn(db),
        json: (v: unknown) => v,
      });
      vi.mocked(authenticate).mockResolvedValue({
        token: 't',
        payload: { user: { dashboards: [{ id: 'dash', googleProfiles: [], tikTokProfiles: [] }] } },
      });
      vi.mocked(listMetaAccounts).mockResolvedValue([{ id: 'good', name: 'Good' }]);
      vi.mocked(fetchProviderObjects).mockImplementation(async (_t, _d, _p, _a, day) => {
        if (day === '2026-10-07') throw new AdsProviderError('UNKNOWN', 500, undefined, 'upstream');
        return [];
      });
      await runAdsImport({ db } as never);
      const calls = JSON.stringify(db.mock.calls);
      expect(calls).toContain('coverage_to=GREATEST');
      expect(calls).toContain('2026-10-06');
      expect(calls).not.toContain('2026-10-08');
      if (attempts === 1) {
        expect(calls).toContain("state='retry_wait'");
        expect(calls).toContain('1800');
        expect(calls).toContain('Tentativa automática 2/2');
      } else {
        expect(calls).toContain("state='paused'");
        expect(calls).not.toContain('Tentativa automática');
      }
    },
  );
  it('does not mutate daily data after a stale worker loses its fenced lease', async () => {
    const conn = {
      owner_id: 'owner',
      dashboard_id: 'dash',
      credentials_encrypted: encryptSecret(
        JSON.stringify({ login: 'l', password: 'p' }),
        'test-secret',
      ),
      range_end: '2026-10-07',
      cursor_date: '2026-10-07',
    };
    const db = vi.fn().mockResolvedValueOnce([conn]).mockResolvedValue([]);
    Object.assign(db, {
      begin: async <T>(fn: (tx: typeof db) => Promise<T>) => fn(db),
      json: (v: unknown) => v,
    });
    vi.mocked(authenticate).mockResolvedValue({
      token: 't',
      payload: { user: { dashboards: [{ id: 'dash', googleProfiles: [], tikTokProfiles: [] }] } },
    });
    vi.mocked(listMetaAccounts).mockResolvedValue([{ id: 'good', name: 'Good' }]);
    vi.mocked(fetchProviderObjects).mockResolvedValue([]);
    await runAdsImport({ db } as never);
    const calls = JSON.stringify(db.mock.calls);
    expect(calls).toContain('IMPORT_LEASE_LOST');
    expect(calls).toContain('FOR UPDATE');
    expect(calls).not.toContain('DELETE FROM ads_intelligence_daily');
    expect(calls).not.toContain('coverage_to=GREATEST');
    expect(db.mock.calls.at(-1)![0].join('')).toContain('AND import_lease_token=');
  });
  it('waits ten minutes on the first explicit upstream 500 without advancing cursor', async () => {
    const conn = {
      owner_id: 'owner',
      dashboard_id: 'dash',
      credentials_encrypted: encryptSecret(
        JSON.stringify({ login: 'l', password: 'p' }),
        'test-secret',
      ),
      range_end: '2026-10-07',
      cursor_date: '2026-10-07',
      retry_attempts: 0,
    };
    const db = vi.fn().mockResolvedValueOnce([conn]).mockResolvedValue([]);
    Object.assign(db, {
      begin: async <T>(fn: (tx: typeof db) => Promise<T>) => fn(db),
      json: (v: unknown) => v,
    });
    vi.mocked(authenticate).mockResolvedValue({
      token: 't',
      payload: { user: { dashboards: [{ id: 'dash', googleProfiles: [], tikTokProfiles: [] }] } },
    });
    vi.mocked(listMetaAccounts).mockResolvedValue([{ id: 'good', name: 'Good' }]);
    vi.mocked(fetchProviderObjects).mockRejectedValue(
      Object.assign(new AdsProviderError('UNKNOWN', 500), { origin: 'upstream' }),
    );
    await runAdsImport({ db } as never);
    const calls = JSON.stringify(db.mock.calls);
    expect(calls).toContain('retry_wait');
    expect(calls).toContain('600');
    expect(calls).not.toContain('DELETE FROM ads_intelligence_daily');
  });
  it('does not login when no weekly connection is due', async () => {
    const db = vi.fn(async () => []);
    await runAdsImport({ db } as never);
    expect(authenticate).not.toHaveBeenCalled();
    expect(db.mock.calls[0]!.join('')).toContain('7 days');
  });
  it('pauses on authentication errors without disclosing credentials', async () => {
    const conn = {
      owner_id: 'owner',
      dashboard_id: 'dash',
      credentials_encrypted: encryptSecret(
        JSON.stringify({ login: 'l', password: 'p' }),
        'test-secret',
      ),
    };
    const db = vi
      .fn()
      .mockResolvedValueOnce([conn])
      .mockResolvedValue([{ owner_id: 'owner' }]);
    vi.mocked(authenticate).mockRejectedValue(new Error('secret upstream error'));
    await runAdsImport({ db } as never);
    expect(authenticate).toHaveBeenCalledTimes(1);
    expect(fetchProviderObjects).not.toHaveBeenCalled();
    expect(JSON.stringify(db.mock.calls)).not.toContain('secret upstream error');
    expect(JSON.stringify(db.mock.calls)).toContain('paused');
  });
  it('authenticates once and replaces one daily snapshot transactionally', async () => {
    const conn = {
      owner_id: 'owner',
      dashboard_id: 'dash',
      credentials_encrypted: encryptSecret(
        JSON.stringify({ login: 'l', password: 'p' }),
        'test-secret',
      ),
      range_end: new Date('2026-08-01T00:00:00Z'),
      cursor_date: new Date('2026-08-01T00:00:00Z'),
    };
    const db = vi
      .fn()
      .mockResolvedValueOnce([conn])
      .mockResolvedValue([{ owner_id: 'owner' }]);
    Object.assign(db, {
      begin: async <T>(fn: (tx: typeof db) => Promise<T>) => fn(db),
      json: (v: unknown) => v,
    });
    Object.assign(db, { json: (v: unknown) => v });
    vi.mocked(authenticate).mockResolvedValue({
      token: 'token',
      payload: { user: { dashboards: [{ id: 'dash', googleProfiles: [], tikTokProfiles: [] }] } },
    });
    vi.mocked(listMetaAccounts).mockResolvedValue([{ id: 'account', name: 'Account' }]);
    vi.mocked(fetchProviderObjects).mockImplementation(async (_t, _d, _p, _a, _from, _to, level) =>
      level === 'campaign'
        ? [{ id: 'campaign', accountId: 'account', name: 'PJR_ENG' }]
        : level === 'adset'
          ? [{ id: 'set', accountId: 'account', name: 'L17' }]
          : [
              {
                name: 'AD5-L17',
                adId: 'a',
                accountId: 'account',
                campaignId: 'campaign',
                adsetId: 'set',
                spend: 3,
              },
            ],
    );
    await runAdsImport({ db } as never);
    expect(authenticate).toHaveBeenCalledTimes(1);
    expect(fetchProviderObjects).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(db.mock.calls)).toContain('DELETE FROM ads_intelligence_daily');
    expect(JSON.stringify(db.mock.calls)).toContain('last_sync_at=now()');
    expect(JSON.stringify(db.mock.calls)).toContain('coverage_complete=');
    expect(JSON.stringify(db.mock.calls)).toContain('campaignName');
    expect(fetchProviderObjects).toHaveBeenCalledWith(
      'token',
      'dash',
      'meta',
      ['account'],
      '2026-08-01',
      '2026-08-01',
      'ad',
    );
  });
  it.each([
    [
      new Date('2001-08-01T00:00:00Z'),
      new Date('2001-10-12T00:00:00Z'),
      'HISTORICAL_RANGE_INVALID',
    ],
    ['Sat Aug 01', '2026-10-12', 'CALENDAR_DATE_INVALID'],
    ['2026-02-31', '2026-10-12', 'CALENDAR_DATE_INVALID'],
    ['2026-08-01', '2099-10-12', 'HISTORICAL_RANGE_INVALID'],
  ])(
    'rejects corrupt cursor %s before any provider authentication or request',
    async (cursor, end, code) => {
      const conn = {
        owner_id: 'owner',
        dashboard_id: 'dash',
        credentials_encrypted: encryptSecret(
          JSON.stringify({ login: 'l', password: 'p' }),
          'test-secret',
        ),
        cursor_date: cursor,
        range_end: end,
      };
      const db = vi
        .fn()
        .mockResolvedValueOnce([conn])
        .mockResolvedValue([{ owner_id: 'owner' }]);
      await runAdsImport({ db } as never);
      expect(authenticate).not.toHaveBeenCalled();
      expect(fetchProviderObjects).not.toHaveBeenCalled();
      expect(JSON.stringify(db.mock.calls)).toContain(code);
      expect(JSON.stringify(db.mock.calls)).not.toContain('2001-08-01');
    },
  );
  it('isolates only currency failures and does not retry a blocked account', async () => {
    vi.mocked(fetchProviderObjects).mockImplementation(async (_t, _d, _p, accounts) => {
      if (accounts.includes('broken'))
        throw new AdsProviderError('COULD_NOT_CONVERT_CURRENCY', 500);
      return [{ accountId: accounts[0], id: 'ad' }];
    });
    const result = await isolateProviderAccounts(
      't',
      'd',
      'meta',
      [
        { id: 'healthy', name: 'Good' },
        { id: 'broken', name: 'Bad' },
      ],
      '2026-08-01',
      '2026-10-12',
    );
    expect(result.accounts).toEqual([{ id: 'healthy', name: 'Good' }]);
    expect(result.failures).toEqual([
      {
        platform: 'meta',
        account_id: 'broken',
        account_name: 'Bad',
        reason: 'COULD_NOT_CONVERT_CURRENCY',
        from: '2026-08-01',
        to: '2026-10-12',
      },
    ]);
    expect(fetchProviderObjects).toHaveBeenCalledTimes(3);
  });
  it('does not split authentication or rate-limit errors into account retry storms', async () => {
    vi.mocked(fetchProviderObjects).mockRejectedValue(new AdsProviderError('RATE_LIMITED', 429));
    await expect(
      isolateProviderAccounts(
        't',
        'd',
        'meta',
        [
          { id: 'a', name: 'A' },
          { id: 'b', name: 'B' },
        ],
        '2026-08-01',
        '2026-10-12',
      ),
    ).rejects.toThrow('RATE_LIMITED');
    expect(fetchProviderObjects).toHaveBeenCalledTimes(1);
  });
  it('preserves an unrepaired historical gap when an account disappears from the catalog', async () => {
    const conn = {
      owner_id: 'owner',
      dashboard_id: 'dash',
      credentials_encrypted: encryptSecret(
        JSON.stringify({ login: 'l', password: 'p' }),
        'test-secret',
      ),
      range_end: null,
      cursor_date: '2026-08-01',
      account_failures: [
        {
          platform: 'meta',
          account_id: 'removed',
          account_name: 'Removed',
          reason: 'COULD_NOT_CONVERT_CURRENCY',
          from: '2026-08-01',
          to: '2026-08-01',
        },
      ],
    };
    const db = vi
      .fn()
      .mockResolvedValueOnce([conn])
      .mockResolvedValue([{ owner_id: 'owner' }]);
    Object.assign(db, {
      begin: async <T>(fn: (tx: typeof db) => Promise<T>) => fn(db),
      json: (v: unknown) => v,
    });
    vi.mocked(authenticate).mockResolvedValue({
      token: 't',
      payload: { user: { dashboards: [{ id: 'dash', googleProfiles: [], tikTokProfiles: [] }] } },
    });
    vi.mocked(listMetaAccounts).mockResolvedValue([]);
    await runAdsImport({ db } as never);
    expect(fetchProviderObjects).not.toHaveBeenCalled();
    expect(JSON.stringify(db.mock.calls)).toContain('ACCOUNT_NOT_IN_CATALOG');
    expect(JSON.stringify(db.mock.calls)).toContain('partial');
  });
  it('isolates currency errors in campaign metadata as well as the daily ad query', async () => {
    vi.mocked(fetchProviderObjects).mockImplementation(
      async (_t, _d, _p, accounts, _from, _to, level) => {
        if (level === 'campaign' && accounts.includes('broken'))
          throw new AdsProviderError('COULD_NOT_CONVERT_CURRENCY', 500);
        return [{ id: 'c', accountId: accounts[0], name: 'PJR_ENG' }];
      },
    );
    const result = await isolateProviderAccounts(
      't',
      'd',
      'meta',
      [
        { id: 'healthy', name: 'A' },
        { id: 'broken', name: 'B' },
      ],
      '2026-08-01',
      '2026-10-12',
      'campaign',
      '2026-08-07',
    );
    expect(result.accounts.map((a) => a.id)).toEqual(['healthy']);
    expect(result.failures[0]?.account_id).toBe('broken');
    expect(fetchProviderObjects).toHaveBeenLastCalledWith(
      't',
      'd',
      'meta',
      ['broken'],
      '2026-08-01',
      '2026-08-07',
      'campaign',
    );
  });
  it('continues an interrupted job at its committed cursor without reimporting August or rechecking blocked accounts', async () => {
    const conn = {
      owner_id: 'owner',
      dashboard_id: 'dash',
      credentials_encrypted: encryptSecret(
        JSON.stringify({ login: 'l', password: 'p' }),
        'test-secret',
      ),
      range_end: new Date('2026-09-05T00:00:00Z'),
      cursor_date: new Date('2026-09-05T00:00:00Z'),
      account_failures: [
        {
          platform: 'meta',
          account_id: 'broken',
          account_name: 'Bad',
          reason: 'COULD_NOT_CONVERT_CURRENCY',
          from: '2026-08-01',
          to: '2026-09-05',
        },
      ],
    };
    const db = vi
      .fn()
      .mockResolvedValueOnce([conn])
      .mockResolvedValue([{ owner_id: 'owner' }]);
    Object.assign(db, {
      begin: async <T>(fn: (tx: typeof db) => Promise<T>) => fn(db),
      json: (v: unknown) => v,
    });
    vi.mocked(authenticate).mockResolvedValue({
      token: 't',
      payload: { user: { dashboards: [{ id: 'dash', googleProfiles: [], tikTokProfiles: [] }] } },
    });
    vi.mocked(listMetaAccounts).mockResolvedValue([
      { id: 'good', name: 'Good' },
      { id: 'broken', name: 'Bad' },
    ]);
    vi.mocked(fetchProviderObjects).mockResolvedValue([]);
    await runAdsImport({ db } as never);
    expect(fetchProviderObjects).toHaveBeenCalledTimes(3);
    for (const call of vi.mocked(fetchProviderObjects).mock.calls) {
      expect(call[3]).toEqual(['good']);
      expect(call[4]).toBe('2026-09-05');
    }
    expect(JSON.stringify(db.mock.calls)).toContain('partial');
  });
  it('refreshes Meta hierarchy each day, keeping metadata query bounds equal to spend day', async () => {
    const conn = {
      owner_id: 'owner',
      dashboard_id: 'dash',
      credentials_encrypted: encryptSecret(
        JSON.stringify({ login: 'l', password: 'p' }),
        'test-secret',
      ),
      range_end: '2026-09-20',
      cursor_date: '2026-09-19',
    };
    const db = vi
      .fn()
      .mockResolvedValueOnce([conn])
      .mockResolvedValue([{ owner_id: 'owner' }]);
    Object.assign(db, {
      begin: async <T>(fn: (tx: typeof db) => Promise<T>) => fn(db),
      json: (v: unknown) => v,
    });
    vi.mocked(authenticate).mockResolvedValue({
      token: 't',
      payload: { user: { dashboards: [{ id: 'dash', googleProfiles: [], tikTokProfiles: [] }] } },
    });
    vi.mocked(listMetaAccounts).mockResolvedValue([{ id: 'good', name: 'Good' }]);
    vi.mocked(fetchProviderObjects).mockResolvedValue([]);
    await runAdsImport({ db } as never);
    expect(fetchProviderObjects).toHaveBeenCalledTimes(6);
    for (const call of vi.mocked(fetchProviderObjects).mock.calls) expect(call[4]).toBe(call[5]);
    expect(
      vi
        .mocked(fetchProviderObjects)
        .mock.calls.filter((c) => c[6] === 'adset')
        .map((c) => c[4]),
    ).toEqual(['2026-09-19', '2026-09-20']);
  });
});
