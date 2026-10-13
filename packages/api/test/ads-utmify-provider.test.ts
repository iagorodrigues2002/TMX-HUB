import { afterEach, describe, expect, it, vi } from 'vitest';
import { accountsFromProfiles, fetchProviderObjects, normalizeAccounts, normalizeProviderAd, providerDashboard } from '../src/services/ads-utmify-provider.js';
afterEach(() => vi.unstubAllGlobals());
describe('actual UTMify provider contract', () => {
  it('deduplicates accounts but retains disabled delivery accounts with enabled connections', () => {
    expect(normalizeAccounts([{id:'a',name:'A',status:'DISABLED',enabled:true},{id:'a',name:'A'},{id:'b',enabled:false}])).toEqual([{id:'a',name:'A'}]);
  });
  it('selects exact dashboard profiles and treats absent catalog as unknown rather than empty', () => {
    const d=providerDashboard({user:{dashboards:[{id:'other',googleProfiles:[{adAccounts:[{id:'x'}]}]},{id:'target',googleProfiles:[],tikTokProfiles:[]}]}},'target')!;
    expect(accountsFromProfiles(d,'google')).toEqual([]);
    expect(()=>accountsFromProfiles({},'tiktok')).toThrow('ACCOUNT_CATALOG_UNAVAILABLE');
  });
  it('joins actual accountId/campaignId/adsetId rows to hierarchy without changing spend cents', () => {
    expect(normalizeProviderAd('meta',{id:'ad',accountId:'a',campaignId:'c',adsetId:'s',name:'AD5',spend:11838},[{id:'c',accountId:'a',name:'PJR_ENG'}],[{id:'s',accountId:'a',name:'L17'}])).toMatchObject({platform:'meta',adAccountId:'a',campaignName:'PJR_ENG',adsetName:'L17',adId:'ad',spend:11838});
  });
  it.each(['meta','google','tiktok'] as const)('uses the official %s endpoint and top-level results', async platform => {
    const fetch=vi.fn(async()=>new Response(JSON.stringify({results:[{id:'a'}]})));vi.stubGlobal('fetch',fetch);
    expect(await fetchProviderObjects('private','dash',platform,['account'],'2026-08-01','2026-08-01','adset')).toEqual([{id:'a'}]);
    const [url,opts]=fetch.mock.calls[0] as unknown as [string,RequestInit];
    expect(url).toContain(platform==='meta'?'/orders/search-objects':`/orders/search-objects/${platform}`);
    expect(JSON.parse(opts.body as string)).toMatchObject({level:platform==='meta'?'adset':platform==='google'?'adGroup':'adgroup',dateRange:{from:'2026-08-01T03:00:00.000Z',to:'2026-08-02T03:00:00.000Z'}});
  });
  it('fails visibly on a TikTok search cap instead of importing incomplete costs', async()=>{
    vi.stubGlobal('fetch',async()=>new Response(JSON.stringify({results:[],tikTokSearchLimit:{reached:true}})));
    await expect(fetchProviderObjects('t','d','tiktok',['a'],'2026-08-01')).rejects.toThrow('TIKTOK_SEARCH_LIMIT_REACHED');
  });
});
