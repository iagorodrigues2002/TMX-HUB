import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../src/env.js', () => ({ env: { TRACKING_ENCRYPTION_KEY: 'test-secret' } }));
vi.mock('../src/services/utmify-sync.js', () => ({
  authenticate: vi.fn(),
  detectDashboardCurrency: () => 'BRL',
}));
vi.mock('../src/services/ads-utmify-provider.js', async () => ({
  ...await vi.importActual('../src/services/ads-utmify-provider.js'),
  listMetaAccounts: vi.fn(), fetchProviderObjects: vi.fn(),
}));
import { authenticate } from '../src/services/utmify-sync.js';
import { AdsProviderError, fetchProviderObjects, listMetaAccounts } from '../src/services/ads-utmify-provider.js';
import { encryptSecret } from '../src/lib/secret-box.js';
import { isolateProviderAccounts, runAdsImport } from '../src/services/ads-intelligence.js';
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
    const db = vi.fn().mockResolvedValueOnce([conn]).mockResolvedValue([]);
    Object.assign(db, { begin: async (fn: Function) => fn(db), json: (v: unknown) => v });
    Object.assign(db,{json:(v:unknown)=>v});
    vi.mocked(authenticate).mockResolvedValue({ token: 'token', payload: {user:{dashboards:[{id:'dash',googleProfiles:[],tikTokProfiles:[]}]}} });
    vi.mocked(listMetaAccounts).mockResolvedValue([{id:'account',name:'Account'}]);
    vi.mocked(fetchProviderObjects).mockImplementation(async(_t,_d,_p,_a,_from,_to,level)=>level==='campaign'?[{id:'campaign',accountId:'account',name:'PJR_ENG'}]:level==='adset'?[{id:'set',accountId:'account',name:'L17'}]:[{ name: 'AD5-L17', adId: 'a', accountId:'account',campaignId:'campaign',adsetId:'set',spend: 3 }]);
    await runAdsImport({ db } as never);
    expect(authenticate).toHaveBeenCalledTimes(1);
    expect(fetchProviderObjects).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(db.mock.calls)).toContain('DELETE FROM ads_intelligence_daily');
    expect(JSON.stringify(db.mock.calls)).toContain('last_sync_at=now()');
    expect(JSON.stringify(db.mock.calls)).toContain('coverage_complete=');
    expect(JSON.stringify(db.mock.calls)).toContain('campaignName');
    expect(fetchProviderObjects).toHaveBeenCalledWith('token','dash','meta',['account'],'2026-08-01','2026-08-01','ad');
  });
  it.each([
    [new Date('2001-08-01T00:00:00Z'),new Date('2001-10-12T00:00:00Z'),'HISTORICAL_RANGE_INVALID'],
    ['Sat Aug 01','2026-10-12','CALENDAR_DATE_INVALID'],
    ['2026-02-31','2026-10-12','CALENDAR_DATE_INVALID'],
    ['2026-08-01','2099-10-12','HISTORICAL_RANGE_INVALID'],
  ])('rejects corrupt cursor %s before any provider authentication or request',async(cursor,end,code)=>{
    const conn={owner_id:'owner',dashboard_id:'dash',credentials_encrypted:encryptSecret(JSON.stringify({login:'l',password:'p'}),'test-secret'),cursor_date:cursor,range_end:end};
    const db=vi.fn().mockResolvedValueOnce([conn]).mockResolvedValue([]);
    await runAdsImport({db} as never);
    expect(authenticate).not.toHaveBeenCalled();
    expect(fetchProviderObjects).not.toHaveBeenCalled();
    expect(JSON.stringify(db.mock.calls)).toContain(code);
    expect(JSON.stringify(db.mock.calls)).not.toContain('2001-08-01');
  });
  it('isolates only currency failures and does not retry a blocked account',async()=>{
    vi.mocked(fetchProviderObjects).mockImplementation(async(_t,_d,_p,accounts)=>{
      if(accounts.includes('broken'))throw new AdsProviderError('COULD_NOT_CONVERT_CURRENCY',500);
      return [{accountId:accounts[0],id:'ad'}];
    });
    const result=await isolateProviderAccounts('t','d','meta',[{id:'healthy',name:'Good'},{id:'broken',name:'Bad'}],'2026-08-01','2026-10-12');
    expect(result.accounts).toEqual([{id:'healthy',name:'Good'}]);
    expect(result.failures).toEqual([{platform:'meta',account_id:'broken',account_name:'Bad',reason:'COULD_NOT_CONVERT_CURRENCY',from:'2026-08-01',to:'2026-10-12'}]);
    expect(fetchProviderObjects).toHaveBeenCalledTimes(3);
  });
  it('does not split authentication or rate-limit errors into account retry storms',async()=>{
    vi.mocked(fetchProviderObjects).mockRejectedValue(new AdsProviderError('RATE_LIMITED',429));
    await expect(isolateProviderAccounts('t','d','meta',[{id:'a',name:'A'},{id:'b',name:'B'}],'2026-08-01','2026-10-12')).rejects.toThrow('RATE_LIMITED');
    expect(fetchProviderObjects).toHaveBeenCalledTimes(1);
  });
  it('preserves an unrepaired historical gap when an account disappears from the catalog',async()=>{
    const conn={owner_id:'owner',dashboard_id:'dash',credentials_encrypted:encryptSecret(JSON.stringify({login:'l',password:'p'}),'test-secret'),range_end:'2026-08-01',cursor_date:'2026-08-01',account_failures:[{platform:'meta',account_id:'removed',account_name:'Removed',reason:'COULD_NOT_CONVERT_CURRENCY',from:'2026-08-01',to:'2026-08-01'}]};
    const db=vi.fn().mockResolvedValueOnce([conn]).mockResolvedValue([]);
    Object.assign(db,{begin:async(fn:Function)=>fn(db),json:(v:unknown)=>v});
    vi.mocked(authenticate).mockResolvedValue({token:'t',payload:{user:{dashboards:[{id:'dash',googleProfiles:[],tikTokProfiles:[]}]}}});
    vi.mocked(listMetaAccounts).mockResolvedValue([]);
    await runAdsImport({db} as never);
    expect(fetchProviderObjects).not.toHaveBeenCalled();
    expect(JSON.stringify(db.mock.calls)).toContain('ACCOUNT_NOT_IN_CATALOG');
    expect(JSON.stringify(db.mock.calls)).toContain('partial');
  });
  it('isolates currency errors in campaign metadata as well as the daily ad query',async()=>{
    vi.mocked(fetchProviderObjects).mockImplementation(async(_t,_d,_p,accounts,_from,_to,level)=>{
      if(level==='campaign'&&accounts.includes('broken'))throw new AdsProviderError('COULD_NOT_CONVERT_CURRENCY',500);
      return [{id:'c',accountId:accounts[0],name:'PJR_ENG'}];
    });
    const result=await isolateProviderAccounts('t','d','meta',[{id:'healthy',name:'A'},{id:'broken',name:'B'}],'2026-08-01','2026-10-12','campaign','2026-08-07');
    expect(result.accounts.map(a=>a.id)).toEqual(['healthy']);
    expect(result.failures[0]?.account_id).toBe('broken');
    expect(fetchProviderObjects).toHaveBeenLastCalledWith('t','d','meta',['broken'],'2026-08-01','2026-08-07','campaign');
  });
});
