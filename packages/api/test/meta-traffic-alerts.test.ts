import { describe, expect, it, vi } from 'vitest';
import {
  type TrafficHealth,
  readMetaTrafficHealth,
  recordTrafficHealth,
  trafficHealthChanges,
} from '../src/services/meta-traffic-alerts.js';
const ad = { id: '20', name: 'Criativo', campaignId: '30', campaignName: 'Campanha A' };
const health = (rejected: (typeof ad)[] = [], status = 1, adsComplete = true): TrafficHealth => ({
  observedAt: new Date().toISOString(),
  accounts: [{ id: 'act_1', name: 'Conta A', status, rejected, adsComplete }],
});
describe('Meta rejection and disabled-account monitoring', () => {
  it('baselines historical rejections, emits transitions once, and permits a new rejection after recovery', () => {
    expect(trafficHealthChanges(null, health([ad]), 'owner').events).toEqual([]);
    const baseline = health();
    const next = trafficHealthChanges(
      baseline,
      health([ad]),
      'owner',
      '00000000-0000-4000-8000-000000000001',
    );
    expect(next.events).toHaveLength(1);
    expect(next.events[0]!.traffic).toMatchObject({
      accountName: 'Conta A',
      campaignName: 'Campanha A',
      adName: 'Criativo',
      type: 'ad_rejected',
    });
    expect(trafficHealthChanges(next.state, health([ad]), 'owner').events).toEqual([]);
    expect(trafficHealthChanges(health(), health([ad]), 'owner').events).toHaveLength(1);
    expect(trafficHealthChanges(baseline, health([], 2), 'owner').events[0]!.traffic.type).toBe(
      'account_disabled',
    );
    expect(trafficHealthChanges(health([], 2), health([], 2), 'owner').events).toEqual([]);
  });
  it('does not infer approval or account loss from partial scans and missing accounts', () => {
    const failed = trafficHealthChanges(health([ad]), health([], 1, false), 'owner');
    expect(failed.events).toEqual([]);
    expect(failed.state.accounts[0]!.rejected).toEqual([ad]);
    expect(failed.state.accounts[0]!.lastCheckComplete).toBe(false);
    expect(failed.state.accounts[0]!.checkedAt).toBeTruthy();
    expect(trafficHealthChanges(failed.state, health([ad]), 'owner').events).toEqual([]);
    expect(
      trafficHealthChanges(
        health(),
        { observedAt: new Date().toISOString(), accounts: [] },
        'owner',
      ).events,
    ).toEqual([]);
    expect(trafficHealthChanges(health([], 1, false), health([ad]), 'owner').events).toEqual([]);
  });
  it('reads rejected ads without insights or date filters, with protected fixed-host pagination', async () => {
    const fetcher = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = new URL(String(input));
      expect(url.origin).toBe('https://graph.facebook.com');
      expect(url.toString()).not.toContain('private-token');
      expect(init?.headers).toEqual({ Authorization: 'Bearer private-token' });
      expect(init?.redirect).toBe('error');
      if (url.pathname.endsWith('/me/adaccounts'))
        return new Response(
          JSON.stringify({ data: [{ id: 'act_1', name: 'Conta A', account_status: 1 }] }),
        );
      expect(url.pathname).toBe('/v25.0/act_1/ads');
      expect(url.searchParams.get('effective_status')).toBe('["DISAPPROVED"]');
      expect(url.searchParams.has('time_range')).toBe(false);
      return new Response(
        JSON.stringify({
          data: [
            {
              id: '20',
              name: 'Criativo',
              effective_status: 'DISAPPROVED',
              campaign: { id: '30', name: 'Campanha A' },
            },
          ],
        }),
      );
    });
    const result = await readMetaTrafficHealth('private-token', fetcher);
    expect(result.accounts[0]!.adsComplete).toBe(true);
    expect(result.accounts[0]!.rejected).toEqual([ad]);
  });
  it('atomically commits one outbox event when two workers observe the same change', async () => {
    let state = JSON.stringify({ ...health(), observedAt: '2026-01-01T00:00:00Z' });
    const events: string[] = [];
    const redis = {
      get: async (key: string) => (key.endsWith(':state') ? state : null),
      eval: async (_script: string, _keys: number, ...args: (string | number)[]) => {
        if (state !== args[2]) return 0;
        state = String(args[3]);
        events.push(...args.slice(4).map(String));
        return 1;
      },
    };
    await Promise.all([
      recordTrafficHealth(redis, 'owner', health([ad])),
      recordTrafficHealth(redis, 'owner', health([ad])),
    ]);
    expect(events).toHaveLength(1);
    const latest = state;
    await recordTrafficHealth(redis, 'owner', { ...health(), observedAt: '2026-01-01T00:00:00Z' });
    expect(state).toBe(latest);
  });
});
