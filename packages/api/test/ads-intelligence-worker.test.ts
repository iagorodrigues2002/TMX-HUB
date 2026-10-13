import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../src/env.js', () => ({ env: { TRACKING_ENCRYPTION_KEY: 'test-secret' } }));
vi.mock('../src/services/utmify-sync.js', () => ({
  authenticate: vi.fn(),
  fetchAds: vi.fn(),
  detectDashboardCurrency: () => 'BRL',
}));
import { authenticate, fetchAds } from '../src/services/utmify-sync.js';
import { encryptSecret } from '../src/lib/secret-box.js';
import { runAdsImport } from '../src/services/ads-intelligence.js';
beforeEach(() => vi.clearAllMocks());
describe('durable weekly importer', () => {
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
    const db = vi.fn().mockResolvedValueOnce([conn]).mockResolvedValue([]);
    vi.mocked(authenticate).mockRejectedValue(new Error('secret upstream error'));
    await runAdsImport({ db } as never);
    expect(authenticate).toHaveBeenCalledTimes(1);
    expect(fetchAds).not.toHaveBeenCalled();
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
      range_end: '2026-08-01',
      cursor_date: '2026-08-01',
    };
    const db = vi.fn().mockResolvedValueOnce([conn]).mockResolvedValue([]);
    Object.assign(db, { begin: async (fn: Function) => fn(db), json: (v: unknown) => v });
    vi.mocked(authenticate).mockResolvedValue({ token: 'token', payload: {} });
    vi.mocked(fetchAds).mockResolvedValue({
      results: [{ name: 'AD5-L17', adId: 'a', campaignName: 'PJR_ENG', spend: 3 }],
      currency: 'BRL',
    });
    await runAdsImport({ db } as never);
    expect(authenticate).toHaveBeenCalledTimes(1);
    expect(fetchAds).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(db.mock.calls)).toContain('DELETE FROM ads_intelligence_daily');
    expect(JSON.stringify(db.mock.calls)).toContain('last_sync_at=now()');
  });
});
