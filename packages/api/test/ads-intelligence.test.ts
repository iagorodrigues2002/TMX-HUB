import { describe, it, expect, vi } from 'vitest';
vi.mock('../src/env.js', () => ({ env: {} }));
import {
  logicalAd,
  matchCampaign,
  nextImportRange,
  physicalKey,
  adsCalendarDay,
  safeAdsImportError,
  adsHierarchyWindowEnd,
  advertiserPage,
} from '../src/services/ads-intelligence.js';
describe('Ads Intelligence identity and weekly ranges', () => {
  it('retains only explicit bounded advertiser page fields, never metrics or account names',()=>{
    expect(advertiserPage({pageName:' Mainex Page ',pageId:' 123 '})).toEqual({page_name:'Mainex Page',page_id:'123'});
    expect(advertiserPage({provider_original:{page_name:'Cobrak Page',page_id:'456'}})).toEqual({page_name:'Cobrak Page',page_id:'456'});
    expect(advertiserPage({accountName:'Not a page',landingPageViews:200,profileId:'789'})).toEqual({page_name:'',page_id:''});
    expect(advertiserPage({pageName:{name:'object'},pageId:['array']})).toEqual({page_name:'',page_id:''});
    expect(advertiserPage({pageName:'x'.repeat(257),pageId:'x'.repeat(129)})).toEqual({page_name:'',page_id:''});
  });
  it('uses verified single-day Meta metadata and bounded weekly windows for other platforms',()=>{
    expect(adsHierarchyWindowEnd('meta','2026-09-19','2026-10-12')).toBe('2026-09-19');
    expect(adsHierarchyWindowEnd('google','2026-09-19','2026-10-12')).toBe('2026-09-25');
    expect(adsHierarchyWindowEnd('tiktok','2026-10-10','2026-10-12')).toBe('2026-10-12');
  });
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
  it('defaults missing batch and strips offer prefixes while preserving hook/avatar', () => {
    expect(logicalAd('PJR_ESP_AD03_L17', '', 'PJR_ESP')).toEqual({batch:'L17',ad:'AD03',variant:''});
    expect(logicalAd('SLM_DE_AD75_H2_AV13', '', 'SLM_DE')).toEqual({batch:'L1',ad:'AD75',variant:'H2_AV13'});
    expect(logicalAd('SLM_DE_AD75_H3_AV13', '', 'SLM_DE')?.variant).toBe('H3_AV13');
    expect(logicalAd('SLM_DE_AD75_H2_AV13 cópia 2', '', 'SLM_DE')?.variant).toBe('H2_AV13');
    expect(logicalAd('AD03_AD04_L17')).toBeNull();
    expect(logicalAd('no ad number')).toBeNull();
  });
  it('preserves meaningful creative variants', () => {
    expect(logicalAd('AD5-L17 HOOK2')?.variant).toBe('HOOK2');
  });
  it('ignores the technical CREATIVE_MP4 suffix but preserves meaningful variants', () => {
    expect(logicalAd('AD04 · CREATIVE_MP4')).toEqual(logicalAd('ad 04'));
    expect(logicalAd('PJR_ENG_AD04_L17 · creative.mp4', '', 'PJR_ENG')).toEqual(logicalAd('AD04', 'L17'));
    expect(logicalAd('AD04 · CREATIVE_MP4 cópia 2')).toEqual(logicalAd('AD04'));
    expect(logicalAd('AD04_H2_AV13 · CREATIVE_MP4')?.variant).toBe('H2_AV13');
    expect(logicalAd('AD04_H3_AV13 · CREATIVE_MP4')?.variant).toBe('H3_AV13');
    expect(logicalAd('AD04_CREATIVE_MP4_H2')?.variant).toBe('CREATIVE_MP4_H2');
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
