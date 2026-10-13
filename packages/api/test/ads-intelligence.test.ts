import { describe, it, expect, vi } from 'vitest';
vi.mock('../src/env.js', () => ({ env: {} }));
import {
  logicalAd,
  matchCampaign,
  nextImportRange,
  physicalKey,
  adsCalendarDay,
  safeAdsImportError,
} from '../src/services/ads-intelligence.js';
describe('Ads Intelligence identity and weekly ranges', () => {
  it('normalizes actual postgres DATE objects and ISO strings, never display strings',()=>{
    expect(adsCalendarDay(new Date('2026-08-01T00:00:00Z'))).toBe('2026-08-01');
    expect(adsCalendarDay('2026-10-12')).toBe('2026-10-12');
    expect(adsCalendarDay('2026-10-12T00:00:00.000Z')).toBe('2026-10-12');
    expect(()=>adsCalendarDay('Sat Aug 01')).toThrow('CALENDAR_DATE_INVALID');
    expect(()=>adsCalendarDay('2026-02-31')).toThrow('CALENDAR_DATE_INVALID');
    expect(()=>adsCalendarDay(new Date('invalid'))).toThrow('CALENDAR_DATE_INVALID');
    expect(nextImportRange(new Date('2026-10-06T12:00:00Z'),'2026-10-13').from).toBe('2026-09-08');
  });
  it('reports only safe error codes, not free-text errors or SQL bodies',()=>{
    expect(safeAdsImportError(new Error('private secret body'),'date_range')).toContain('INTERNAL_ERROR');
    expect(safeAdsImportError(new Error('private secret body'),'date_range')).not.toContain('private');
    expect(safeAdsImportError({code:'22P02',message:'sensitive query'},'persist:2026-08-01')).toContain('DATABASE_22P02');
  });
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
