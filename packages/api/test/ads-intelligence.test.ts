import { describe, it, expect, vi } from 'vitest';
vi.mock('../src/env.js', () => ({ env: {} }));
import {
  logicalAd,
  matchCampaign,
  nextImportRange,
  physicalKey,
} from '../src/services/ads-intelligence.js';
describe('Ads Intelligence identity and weekly ranges', () => {
  it('normalizes batch in ad or adset', () => {
    expect(logicalAd('AD5-L17')).toEqual(logicalAd('AD05', 'Leva17'));
  });
  it('rejects conflicting batches', () => {
    expect(logicalAd('AD5-L17', 'Leva18')).toBeNull();
  });
  it('preserves meaningful creative variants', () => {
    expect(logicalAd('AD5-L17 HOOK2')?.variant).toBe('HOOK2');
  });
  it('matches longest offer token', () => {
    expect(
      matchCampaign('PJR_ENG_TTK L17', [
        { id: '1', name: 'PJR_ENG' },
        { id: '2', name: 'PJR_ENG_TTK' },
      ]),
    ).toBe('2');
  });
  it('rejects same-name offer ownership ambiguity', () => {
    expect(
      matchCampaign('PJR_ENG', [
        { id: '1', name: 'PJR_ENG' },
        { id: '2', name: 'PJR_ENG' },
      ]),
    ).toBeNull();
  });
  it('initial import begins August 1 through yesterday', () => {
    expect(nextImportRange(null, '2026-10-13')).toEqual({ from: '2026-08-01', to: '2026-10-12' });
  });
  it('revisits 35 days but does not skip downtime', () => {
    expect(nextImportRange('2026-08-15T12:00:00Z', '2026-10-13').from).toBe('2026-08-15');
    expect(nextImportRange('2026-10-06T12:00:00Z', '2026-10-13').from).toBe('2026-09-08');
  });
  it('physical identity separates account and campaign', () => {
    expect(physicalKey({ adId: '123', adAccountId: 'A' })).not.toBe(
      physicalKey({ adId: '123', adAccountId: 'B' }),
    );
  });
});
