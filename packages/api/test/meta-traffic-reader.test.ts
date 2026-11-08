import { describe, expect, it, vi } from 'vitest';
import {
  readMetaTraffic as readLocalMetaTraffic,
  validTrafficRange,
} from '../src/services/meta-traffic-reader.js';
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const account = {
  id: 'act_1',
  name: 'Conta',
  currency: 'USD',
  account_status: 1,
  timezone_name: 'America/New_York',
  business: { id: '2', name: 'BM' },
};
const row = {
  campaign_id: '10',
  campaign_name: '[PJR_ENG] Hoje',
  adset_id: '100',
  adset_name: 'Conjunto',
  ad_id: '1000',
  ad_name: 'Vídeo',
  spend: '20.00',
  impressions: '100',
  inline_link_clicks: '10',
  actions: [
    { action_type: 'offsite_conversion.fb_pixel_purchase', value: '2' },
    { action_type: 'video_view', value: '30' },
  ],
  action_values: [{ action_type: 'offsite_conversion.fb_pixel_purchase', value: '60' }],
  account_currency: 'USD',
  date_start: '2026-11-08',
};
function fakeFetch(hourlyFail = false) {
  return vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.hostname === 'api.frankfurter.dev')
      return response({ base: 'USD', rates: { '2026-11-06': { BRL: 5.5 } } });
    if (url.pathname.endsWith('/me/adaccounts')) return response({ data: [account] });
    if (url.pathname.endsWith('/insights')) {
      if (url.searchParams.has('breakdowns'))
        return hourlyFail
          ? response({ error: { message: 'secret-token' } }, 400)
          : response({
              data: [
                { ...row, hourly_stats_aggregated_by_advertiser_time_zone: '10:00:00 - 10:59:59' },
              ],
            });
      return response({
        data: [
          row,
          {
            ...row,
            campaign_id: '20',
            campaign_name: 'Julho zerada',
            ad_id: '2000',
            spend: '0',
            actions: [],
            action_values: [],
          },
        ],
      });
    }
    return response({
      id: url.pathname.split('/').at(-1),
      effective_status: 'ACTIVE',
      creative: { video_id: 'video', object_type: 'VIDEO' },
    });
  });
}
describe('local readonly traffic integration', () => {
  it.each([
    [200, 'API access blocked.', 'API access blocked'],
    [190, 'private secret-token', 'expirou ou foi revogada'],
    [4, 'private secret-token', 'limitou temporariamente'],
  ])(
    'explains Meta error %s without leaking upstream credentials',
    async (code, message, expected) => {
      const fetcher = vi.fn(async () => response({ error: { code, message } }, 400));
      await expect(
        readLocalMetaTraffic('secret-token', '2026-11-07', '2026-11-07', fetcher),
      ).rejects.toThrow(expected);
      try {
        await readLocalMetaTraffic('secret-token', '2026-11-07', '2026-11-07', fetcher);
      } catch (error) {
        expect(String(error)).not.toContain('secret-token');
      }
    },
  );
  it('imports only campaigns with spend, reads hourly data and never sends the credential in a URL or to FX', async () => {
    const fetcher = fakeFetch();
    const { snapshot } = await readLocalMetaTraffic(
      'secret-token',
      '2026-11-08',
      '2026-11-08',
      fetcher as typeof fetch,
    );
    expect(snapshot.campaigns.map((c) => c.id)).toEqual(['10']);
    expect(snapshot.insights).toHaveLength(1);
    expect(snapshot.hourly[0]!.hour).toBe(10);
    expect(snapshot.insights[0]!.video).toBe(true);
    expect(snapshot.campaigns[0]!.effectiveStatus).toBe('ACTIVE');
    for (const [url, options] of fetcher.mock.calls) {
      expect(String(url)).not.toContain('secret-token');
      expect(new URL(String(url)).searchParams.has('ids')).toBe(false);
      if (new URL(String(url)).pathname.endsWith('/insights'))
        expect(new URL(String(url)).searchParams.get('use_unified_attribution_setting')).toBe(
          'true',
        );
      expect(options?.method ?? 'GET').toBe('GET');
      if (new URL(String(url)).hostname === 'api.frankfurter.dev')
        expect(options?.headers).toBeUndefined();
      else expect(options?.headers).toEqual({ Authorization: 'Bearer secret-token' });
    }
  });
  it('marks missing hourly data instead of inventing measurements', async () => {
    const { snapshot } = await readLocalMetaTraffic(
      'secret-token',
      '2026-11-08',
      '2026-11-08',
      fakeFetch(true) as typeof fetch,
    );
    expect(snapshot.hourly).toEqual([]);
    expect(snapshot.hourlyFailures).toEqual(['act_1']);
    expect(snapshot.insights).toHaveLength(1);
  });
  it('rejects failed or incomplete account pagination without following arbitrary URLs', async () => {
    const denied = vi.fn().mockResolvedValue(response({ error: { message: 'secret-token' } }, 400));
    await expect(
      readLocalMetaTraffic('secret-token', '2026-11-08', '2026-11-08', denied),
    ).rejects.toThrow('A Meta não permitiu');
    const loop = vi.fn().mockImplementation(async () =>
      response({
        data: [account],
        paging: { next: 'https://attacker.invalid/steal', cursors: { after: 'same' } },
      }),
    );
    await expect(
      readLocalMetaTraffic('secret-token', '2026-11-08', '2026-11-08', loop),
    ).rejects.toThrow('Paginação incompleta');
    expect(loop.mock.calls.every(([url]) => url.hostname === 'graph.facebook.com')).toBe(true);
  });
  it('validates dates and bounds the reporting period', () => {
    expect(validTrafficRange('2026-02-30', '2026-03-01')).toBe(false);
    expect(validTrafficRange('2026-11-09', '2026-11-08')).toBe(false);
    expect(validTrafficRange('2026-01-01', '2026-12-31')).toBe(true);
    expect(validTrafficRange('2025-01-01', '2026-12-31')).toBe(false);
  });
  it('rejects malformed upstream measurements instead of publishing fabricated zeros', async () => {
    const original = fakeFetch();
    const invalid = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) =>
      new URL(String(input)).pathname.endsWith('/insights')
        ? response({ data: [{ ...row, spend: 'not-a-number' }] })
        : original(input, init),
    );
    await expect(
      readLocalMetaTraffic('secret-token', '2026-11-08', '2026-11-08', invalid as typeof fetch),
    ).rejects.toThrow('métricas incompletas');
  });
});
