import Fastify from 'fastify';
import { describe, it, expect, vi } from 'vitest';
vi.mock('../src/env.js', () => ({ env: { TRACKING_ENCRYPTION_KEY: 'test-secret' } }));
import routes from '../src/routes/ads-intelligence.js';
async function setup(role = 'admin', own = 'owner-a') {
  const app = Fastify();
  const sql = vi.fn(async () => []);
  Object.assign(sql, { begin: async (fn: Function) => fn(sql) });
  app.decorate('db', sql);
  app.decorate('offerStore', {
    listAll: async () => [
      { id: 'a', name: 'PJR_ENG', userId: 'owner-a', companyName: 'TMX' },
      { id: 'b', name: 'PJR_ENG', userId: 'owner-b' },
    ],
    get: async (id: string) => ({ id, userId: id === 'a' ? 'owner-a' : 'owner-b' }),
  });
  app.addHook('preHandler', async (req) => {
    (req as any).user = { sub: own, role };
  });
  await app.register(routes);
  return { app, sql };
}
describe('central analytics access isolation', () => {
  it('merges all accounts/platforms in the same offer, batch and variant and recalculates weighted ratios once',async()=>{
    const {app,sql}=await setup();
    sql.mockResolvedValueOnce([{state:'ready',last_sync_at:'2026-10-13',coverage_from:'2026-08-01',coverage_to:'2026-10-12'}] as never)
      .mockResolvedValueOnce([{platform:'meta',adAccountId:'acc1',adId:'1',spend:10000},{platform:'google',adAccountId:'acc2',adId:'2',spend:30000}].map(raw=>({day:'2026-08-01',currency:'BRL',raw:{...raw,name:'PJR_ENG_AD03_L17',campaignName:'PJR_ENG'}})) as never)
      .mockResolvedValueOnce([]).mockResolvedValueOnce([{offer_id:'a',ad_id:'1',front_sales:1,upsell_sales:0,revenue:'20000'},{offer_id:'a',ad_id:'2',front_sales:1,upsell_sales:1,revenue:'30000'}] as never).mockResolvedValueOnce([]);
    const data=(await app.inject('/ads-intelligence')).json();
    expect(data.batches).toHaveLength(1);expect(data.batches[0].ads).toHaveLength(1);
    expect(data.batches[0].totals).toMatchObject({spend:400,revenue:500,roas:1.25,roi:25,front_sales:2,upsell_sales:1});
    expect(data.batches[0].ads[0].sources.map((s:any)=>s.ad_id)).toEqual(['1','2']);
    await app.close();
  });
  it('does not consolidate across offers/companies or hook/avatar variants',async()=>{
    const {app,sql}=await setup();
    app.offerStore.listAll=async()=>[{id:'a',name:'PJR_ENG',userId:'owner-a',companyName:'TMX'},{id:'c',name:'SLM_DE',userId:'owner-a',companyName:'Cobrak'}] as any;
    sql.mockResolvedValueOnce([{state:'ready',last_sync_at:'2026-10-13',coverage_from:'2026-08-01',coverage_to:'2026-10-12'}] as never)
      .mockResolvedValueOnce(['PJR_ENG_AD03_H2_AV13_L17','PJR_ENG_AD03_H3_AV13_L17','SLM_DE_AD03_H2_AV13_L17'].map((name,index)=>({day:'2026-08-01',currency:'BRL',raw:{name,adAccountId:String(index),spend:10000}})) as never)
      .mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const data=(await app.inject('/ads-intelligence')).json();
    expect(data.batches).toHaveLength(2);expect(data.batches.map((b:any)=>b.offer_id)).toEqual(['a','c']);
    expect(data.batches[0].ads).toHaveLength(2);expect(data.batches[1].ads).toHaveLength(1);
    expect(data.batches[0].totals.spend).toBe(200);expect(data.batches[1].totals.spend).toBe(100);
    await app.close();
  });
  it('uses platform and campaign IDs within a physical source, preserves totals and ignores renamed campaign names for unique IDs',async()=>{
    const {app,sql}=await setup();
    sql.mockResolvedValueOnce([{state:'ready',last_sync_at:'2026-10-13',coverage_from:'2026-08-01',coverage_to:'2026-10-12'}] as never)
      .mockResolvedValueOnce([{platform:'meta',adAccountId:'m',adId:'shared',campaignId:'meta-c',name:'PJR_ENG_AD03_L17'},{platform:'google',adAccountId:'g',adId:'shared',campaignId:'google-c',name:'PJR_ENG_AD04_L17'}].map(raw=>({day:'2026-08-01',currency:'BRL',raw:{...raw,campaignName:'PJR_ENG',spend:10000}})) as never)
      .mockResolvedValueOnce([]).mockResolvedValueOnce([
        {offer_id:'a',ad_id:'shared',campaign_id:'meta-c',traffic_source:'FB',campaign_name:'old name',front_sales:1,upsell_sales:0,revenue:'20000'},
        {offer_id:'a',ad_id:'shared',campaign_id:'google-c',traffic_source:'youtube',front_sales:1,upsell_sales:0,revenue:'30000'},
        {offer_id:'a',ad_id:'shared',campaign_id:'google-c',traffic_source:'meta',front_sales:1,upsell_sales:0,revenue:'10000'},
      ] as never).mockResolvedValueOnce([{offer_id:'a',ad_id:'shared',campaign_id:'meta-c',traffic_source:'instagram',ic:2}] as never);
    const data=(await app.inject('/ads-intelligence')).json();
    expect(data.batches).toHaveLength(1);
    expect(data.batches[0].ads[0]).toMatchObject({revenue:200,front_sales:1,ic:2});
    expect(data.batches[0].ads[1]).toMatchObject({revenue:300,front_sales:1});
    expect(data.batches[0].totals.revenue+data.unattributed.revenue).toBe(600);
    expect(data.batches[0].totals.front_sales+data.unattributed.front_sales).toBe(3);
    const queries=sql.mock.calls.map(call=>Array.from(call[0] as any).join(''));
    expect(queries.some(query=>query.includes("GROUP BY p.offer_id")&&query.includes("o.source->>'campaign_id',o.source->>'utm_source'"))).toBe(true);
    const icQuery=queries.find(query=>query.includes('WITH event_facts'))!;
    expect(icQuery).toContain("GROUP BY offer_id,day,source->>'ad_id',source->>'campaign_name',source->>'ad_name',source->>'adset_name'");
    expect(icQuery).toContain("count(DISTINCT(visitor_id,session_id))");
    await app.close();
  });
  it('exposes advertiser pages per physical source without treating account or landing metrics as a page',async()=>{
    const {app,sql}=await setup();
    sql.mockResolvedValueOnce([{state:'ready',last_sync_at:'2026-10-13',coverage_from:'2026-08-01',coverage_to:'2026-10-12'}] as never)
      .mockResolvedValueOnce([
        {day:'2026-08-01',currency:'BRL',raw:{name:'PJR_ENG_AD03_L17',adId:'3',adAccountId:'one',spend:10000,pageName:'Page One',pageId:'100'}},
        {day:'2026-08-01',currency:'BRL',raw:{name:'PJR_ENG_AD03_L17',adId:'3',adAccountId:'two',spend:10000,provider_original:{page_name:'Page Two',page_id:'200'}}},
        {day:'2026-08-01',currency:'BRL',raw:{name:'PJR_ENG_AD03_L17',adId:'3',adAccountId:'three',spend:10000,accountName:'Not a page',landingPageViews:10}},
      ] as never).mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const data=(await app.inject('/ads-intelligence')).json();
    expect(data.batches).toHaveLength(1);
    expect(data.batches[0].ads[0].sources[0]).toMatchObject({account_id:'one',page_name:'Page One',page_id:'100'});
    expect(data.batches[0].ads[0].sources[1]).toMatchObject({account_id:'two',page_name:'Page Two',page_id:'200'});
    expect(data.batches[0].ads[0].sources[2]).toMatchObject({account_id:'three',page_name:'',page_id:''});
    await app.close();
  });
  it('excludes only exact owner campaign names from existing/future views without deleting raw snapshots',async()=>{
    const {app,sql}=await setup();
    const excluded='[SEARCH] Hillside - Leads | 28.09';
    const makeRows=()=>[
      {day:'2026-08-01',currency:'BRL',raw:{campaignName:excluded,name:'unknown',spend:0}},
      {day:'2026-10-12',currency:'BRL',raw:{campaignName:excluded,name:'PJR_ENG_AD03_L17',adAccountId:'acc',spend:10000}},
      {day:'2026-10-12',currency:'BRL',raw:{campaignName:excluded+' extra',name:'unknown',spend:0}},
    ];
    sql.mockResolvedValueOnce([{excluded_campaigns:[excluded],state:'ready',last_sync_at:'2026-10-13',coverage_from:'2026-08-01',coverage_to:'2026-10-12'}] as never)
      .mockResolvedValueOnce(makeRows() as never).mockResolvedValueOnce([]);
    const data=(await app.inject('/ads-intelligence')).json();
    expect(data.pending).toHaveLength(1);expect(data.pending[0].campaign_name).toBe(excluded+' extra');
    expect(data.batches).toHaveLength(0);
    expect(sql.mock.calls.every(call=>!Array.from(call[0] as any).join('').includes('DELETE'))).toBe(true);
    sql.mockResolvedValueOnce([{state:'ready',last_sync_at:'2026-10-13',coverage_from:'2026-08-01',coverage_to:'2026-10-12'}] as never)
      .mockResolvedValueOnce(makeRows() as never).mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const legacy=(await app.inject('/ads-intelligence')).json();
    expect(legacy.pending).toHaveLength(2);expect(legacy.batches).toHaveLength(1);
    await app.close();
  });
  it('reads another owner connection independently with no globally hardcoded exclusion',async()=>{
    const {app,sql}=await setup('admin','owner-b');
    sql.mockResolvedValueOnce([{excluded_campaigns:[],state:'ready',last_sync_at:'2026-10-13',coverage_from:'2026-08-01',coverage_to:'2026-10-12'}] as never)
      .mockResolvedValueOnce([{day:'2026-08-01',currency:'BRL',raw:{campaignName:'[SEARCH] Hillside - Leads | 28.09',name:'PJR_ENG_AD03_L17',adAccountId:'acc',spend:10000}}] as never)
      .mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const data=(await app.inject('/ads-intelligence')).json();
    expect(data.batches[0].offer_id).toBe('b');
    expect(sql.mock.calls[0].slice(1)).toEqual(['owner-b']);
    await app.close();
  });
  it('shows committed groups while paused, with honest covered dates and no ROI',async()=>{
    const {app,sql}=await setup();
    sql.mockResolvedValueOnce([{state:'paused',coverage_from:new Date('2026-08-01T00:00:00Z'),coverage_to:new Date('2026-10-06T00:00:00Z'),coverage_complete:false,retry_attempts:2}] as never)
      .mockResolvedValueOnce([{day:'2026-10-06',raw:{platform:'meta',name:'AD5-L17',adId:'a',adAccountId:'acc',campaignName:'PJR_ENG',spend:10000},currency:'BRL'}] as never)
      .mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const data=(await app.inject('/ads-intelligence')).json();
    expect(data.batches).toHaveLength(1);expect(data.batches[0].totals).toMatchObject({spend:100,roi:null,roas:null});
    expect(data.coverage).toEqual({from:'2026-08-01',to:'2026-10-06',complete:false});await app.close();
  });
  it('calculates healthy account ratios provisionally without including failed account costs', async()=>{
    const {app,sql}=await setup();
    sql.mockResolvedValueOnce([{state:'partial',last_sync_at:'2026-10-13',coverage_from:'2026-08-01',coverage_to:'2026-10-12',coverage_complete:false,account_failures:[{platform:'meta',account_id:'bad',reason:'COULD_NOT_CONVERT_CURRENCY'}]}] as never)
      .mockResolvedValueOnce([{day:'2026-08-01',raw:{platform:'meta',name:'AD5-L17',adId:'a',adAccountId:'acc',campaignName:'PJR_ENG',spend:10000},currency:'BRL'}] as never)
      .mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const r=await app.inject('/ads-intelligence'); const data=r.json();
    expect(data.batches).toHaveLength(1);
    expect(data.batches[0].totals).toMatchObject({spend:100,roi:-100,roas:0,calculation_status:'provisional'});
    expect(data.batches[0].ads[0]).toMatchObject({spend:100,roi:-100,roas:0,calculation_status:'provisional'});
    expect(data.coverage.complete).toBe(false);
    expect(data.batches[0].ads[0].sources[0].platform).toBe('meta');
    await app.close();
  });
  it('uses provider cents and TMX revenue to recompute batch ROAS and ROI', async () => {
    const { app, sql } = await setup();
    sql
      .mockResolvedValueOnce([
        {
          state: 'ready',
          last_sync_at: '2026-10-13',
          coverage_from: new Date('2026-08-01T00:00:00Z'),
          coverage_to: new Date('2026-10-12T00:00:00Z'),
        },
      ] as never)
      .mockResolvedValueOnce([
        {
          day: new Date('2026-08-01T00:00:00Z'),
          raw: {
            name: 'AD5-L17',
            adId: '5',
            campaignName: 'PJR_ENG',
            adAccountId: 'acc',
            spend: 6000,
            impressions: 1000,
            inlineLinkClicks: 30,
            videoViews3Seconds: 200,
          },
          currency: 'BRL',
        },
        {
          day: '2026-08-01',
          raw: {
            name: 'AD06',
            adsetName: 'Leva17',
            adId: '6',
            campaignName: 'PJR_ENG',
            adAccountId: 'acc',
            spend: 4000,
            impressions: 1000,
            inlineLinkClicks: 20,
            videoViews3Seconds: 100,
          },
          currency: 'BRL',
        },
      ] as never)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          offer_id: 'a',
          ad_id: '5',
          day: '2026-10-01',
          front_sales: 1,
          upsell_sales: 0,
          revenue: '20000',
        },
        {
          offer_id: 'a',
          ad_id: '6',
          day: '2026-10-02',
          front_sales: 0,
          upsell_sales: 1,
          revenue: '5000',
        },
      ] as never)
      .mockResolvedValueOnce([{ offer_id: 'a', ad_id: '5', day: '2026-08-01', ic: 3 }] as never);
    const res = await app.inject('/ads-intelligence');
    expect(res.statusCode).toBe(200);
    const data = res.json();
    expect(data.batches).toHaveLength(1);
    expect(data.coverage).toMatchObject({from:'2026-08-01',to:'2026-10-12'});
    expect(data.batches[0].ads).toHaveLength(2);
    expect(data.batches[0].totals).toMatchObject({
      spend: 100,
      revenue: 250,
      roas: 2.5,
      roi: 150,
      cpc: 2,
      cpm: 50,
      ctr: 2.5,
      hook_rate: 15,
      front_sales: 1,
      upsell_sales: 1,
      ic: 3,
    });
    await app.close();
  });
  it('preserves unknown hook rate and marks healthy ratios provisional if unresolved traffic remains', async () => {
    const { app, sql } = await setup();
    sql
      .mockResolvedValueOnce([
        {
          state: 'ready',
          last_sync_at: '2026-10-13',
          coverage_from: '2026-08-01',
          coverage_to: '2026-10-12',
        },
      ] as never)
      .mockResolvedValueOnce([
        {
          day: '2026-08-01',
          raw: {
            name: 'AD5-L17',
            adId: '5',
            campaignName: 'PJR_ENG',
            spend: 10000,
            impressions: 1000,
            adAccountId: 'acc',
          },
          currency: 'BRL',
        },
        { day: '2026-08-01', raw: { name: 'unknown', spend: 5000 }, currency: 'BRL' },
      ] as never)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const res = await app.inject('/ads-intelligence');
    const data = res.json();
    expect(data.pending).toHaveLength(1);
    expect(data.batches[0].totals).toMatchObject({
      spend: 100,
      hook_rate: null,
      roi: -100,
      roas: 0,
      calculation_status: 'provisional',
    });
    await app.close();
  });
  it('classifies existing ad prefixes without hierarchy and blocks only failed-account ratios', async()=>{
    const {app,sql}=await setup();
    sql.mockResolvedValueOnce([{state:'partial',last_sync_at:'2026-10-13',coverage_from:'2026-08-01',coverage_to:'2026-10-12',coverage_complete:false,account_failures:[{platform:'meta',account_id:'bad',from:'2026-08-01',to:'2026-10-12'}]}] as never)
      .mockResolvedValueOnce(['good','bad'].map(account=>({day:'2026-08-01',currency:'BRL',raw:{platform:'meta',name:'PJR_ENG_AD75_H2_AV13',adId:account,adAccountId:account,spend:10000}})) as never)
      .mockResolvedValueOnce([]).mockResolvedValueOnce([{offer_id:'a',ad_id:'good',day:'2026-09-01',front_sales:1,upsell_sales:1,revenue:'25000'}] as never).mockResolvedValueOnce([]);
    const data=(await app.inject('/ads-intelligence')).json();
    expect(data.pending).toHaveLength(0);expect(data.batches).toHaveLength(1);
    expect(data.batches[0]).toMatchObject({name:'L1',totals:{spend:200,revenue:250,roas:null,roi:null,calculation_status:'unavailable'}});
    expect(data.batches[0].ads[0].name).toBe('AD75 · H2_AV13');
    await app.close();
  });
  it('counts a fact once when duplicate physical ad IDs resolve to the same consolidated creative', async()=>{
    const {app,sql}=await setup();
    sql.mockResolvedValueOnce([{state:'ready',last_sync_at:'2026-10-13',coverage_from:'2026-08-01',coverage_to:'2026-10-12'}] as never)
      .mockResolvedValueOnce(['one','two'].map(account=>({day:'2026-08-01',currency:'BRL',raw:{platform:'meta',name:'PJR_ENG_AD03_L17',campaignName:'PJR_ENG',adAccountId:account,adId:'same',spend:10000}})) as never)
      .mockResolvedValueOnce([]).mockResolvedValueOnce([{offer_id:'a',ad_id:'same',day:'2026-09-01',front_sales:1,upsell_sales:0,revenue:'25000'}] as never).mockResolvedValueOnce([]);
    const data=(await app.inject('/ads-intelligence')).json();
    expect(data.batches).toHaveLength(1);expect(data.unattributed.revenue).toBe(0);
    expect(data.batches[0].totals).toMatchObject({spend:200,revenue:250,front_sales:1,roas:1.25,roi:25});
    await app.close();
  });
  it('does not divide unknown or zero spend and does not duplicate hook/avatar variations', async()=>{
    const {app,sql}=await setup();
    sql.mockResolvedValueOnce([{state:'ready',last_sync_at:'2026-10-13',coverage_from:'2026-08-01',coverage_to:'2026-10-12'}] as never)
      .mockResolvedValueOnce([null,0,10000].map((spend,index)=>({day:'2026-08-01',currency:'BRL',raw:{platform:'meta',name:`PJR_ENG_AD75_H${index+1}_AV13`,adAccountId:'acc',adId:String(index),spend}})) as never)
      .mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const data=(await app.inject('/ads-intelligence')).json();
    expect(data.batches[0].ads).toHaveLength(3);
    expect(data.batches[0].ads[0]).toMatchObject({spend:null,roas:null,roi:null,calculation_status:'unavailable'});
    expect(data.batches[0].ads[1]).toMatchObject({spend:0,roas:null,roi:null,calculation_status:'unavailable'});
    expect(data.batches[0].ads[2]).toMatchObject({spend:100,roas:0,roi:-100,calculation_status:'complete'});
    expect(data.batches[0].totals).toMatchObject({spend:null,roas:null,roi:null});
    await app.close();
  });
  it('does not mix snapshot costs outside confirmed coverage into ratios', async()=>{
    const {app,sql}=await setup();
    sql.mockResolvedValueOnce([{state:'partial',last_sync_at:'2026-10-13',coverage_from:'2026-08-01',coverage_to:'2026-10-12'}] as never)
      .mockResolvedValueOnce(['2026-10-12','2026-10-13'].map(day=>({day,currency:'BRL',raw:{name:'PJR_ENG_AD03_L17',adId:'3',adAccountId:'acc',spend:10000}})) as never)
      .mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const data=(await app.inject('/ads-intelligence')).json();
    expect(data.batches[0].totals).toMatchObject({spend:100,roas:0,roi:-100,calculation_status:'provisional'});
    expect(data.pending[0].reason).toBe('Data fora do período de custos confirmado');
    await app.close();
  });
  it('keeps conflicting campaign/ad offers pending unless owner manual mapping resolves it', async()=>{
    const {app,sql}=await setup();
    app.offerStore.listAll=async()=>[{id:'a',name:'PJR_ENG',userId:'owner-a'},{id:'c',name:'PJR_ESP',userId:'owner-a'}] as any;
    const raw={platform:'meta',campaignName:'PJR_ENG',campaignId:'campaign',adAccountId:'acc',name:'PJR_ESP_AD03_L17',spend:10000};
    const connection={state:'ready',last_sync_at:'2026-10-13',coverage_from:'2026-08-01',coverage_to:'2026-10-12'};
    sql.mockResolvedValueOnce([connection] as never).mockResolvedValueOnce([{day:'2026-08-01',currency:'BRL',raw}] as never).mockResolvedValueOnce([]);
    const data=(await app.inject('/ads-intelligence')).json();
    expect(data.batches).toHaveLength(0);expect(data.pending[0].reason).toBe('Oferta conflitante entre campanha e anúncio');
    sql.mockResolvedValueOnce([connection] as never).mockResolvedValueOnce([{day:'2026-08-01',currency:'BRL',raw}] as never)
      .mockResolvedValueOnce([{campaign_key:JSON.stringify(['meta','acc','campaign','PJR_ENG']),offer_id:'c'}] as never).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    expect((await app.inject('/ads-intelligence')).json().batches[0].offer_id).toBe('c');
    await app.close();
  });
  it('blocks platform-wide gaps and unknown account scope but not other platforms or expired gaps', async()=>{
    const {app,sql}=await setup();
    sql.mockResolvedValueOnce([{state:'partial',last_sync_at:'2026-10-13',coverage_from:'2026-08-01',coverage_to:'2026-10-12',account_failures:[{platform:'meta',account_id:'',from:'2026-08-01',to:'2026-10-12'},{platform:'google',account_id:'google',from:'2026-07-01',to:'2026-07-31'}]}] as never)
      .mockResolvedValueOnce([{platform:'meta',adAccountId:'meta'},{platform:'google',adAccountId:'google'},{platform:'tiktok',adAccountId:''}].map((scope,index)=>({day:'2026-08-01',currency:'BRL',raw:{...scope,name:`PJR_ENG_AD0${index+1}_L17`,spend:10000}})) as never)
      .mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const data=(await app.inject('/ads-intelligence')).json();
    expect(data.batches[0].totals).toMatchObject({roas:null,calculation_status:'unavailable'});
    expect(data.batches[0].ads[1]).toMatchObject({roas:0,roi:-100,calculation_status:'provisional'});
    expect(data.batches[0].ads[2]).toMatchObject({roas:null,calculation_status:'unavailable'});
    await app.close();
  });
  it('blocks only matched unknown BRL revenue and keeps unrelated known ratios provisional', async()=>{
    const {app,sql}=await setup();
    sql.mockResolvedValueOnce([{state:'ready',last_sync_at:'2026-10-13',coverage_from:'2026-08-01',coverage_to:'2026-10-12'}] as never)
      .mockResolvedValueOnce(['1','2'].map(id=>({day:'2026-08-01',currency:'BRL',raw:{name:`PJR_ENG_AD0${id}_L17`,adId:id,adAccountId:'acc',spend:10000}})) as never)
      .mockResolvedValueOnce([]).mockResolvedValueOnce([
        {offer_id:'a',ad_id:'1',front_sales:2,upsell_sales:0,revenue:'20000',unknown_revenue_sales:1},
        {offer_id:'a',ad_id:'2',front_sales:1,upsell_sales:0,revenue:'25000',unknown_revenue_sales:0},
        {offer_id:'a',ad_id:'missing',front_sales:1,upsell_sales:0,revenue:null,unknown_revenue_sales:1},
      ] as never).mockResolvedValueOnce([]);
    const data=(await app.inject('/ads-intelligence')).json();
    expect(data.batches[0].ads[0]).toMatchObject({front_sales:2,revenue:200,roas:null,roi:null,calculation_reason:'Faturamento com conversão pendente'});
    expect(data.batches[0].ads[1]).toMatchObject({revenue:250,roas:2.5,roi:150,calculation_status:'provisional'});
    expect(data.batches[0].totals.roas).toBeNull();
    expect(data.unattributed.unknown_revenue_sales).toBe(1);
    const query=sql.mock.calls.map(call=>Array.from(call[0] as any).join('')).find(value=>value.includes('WITH resolved'))!;
    expect(query).not.toContain('AND o.amount_brl_minor IS NOT NULL');
    expect(query).toContain('count(*) FILTER(WHERE o.amount_brl_minor IS NULL)');
    await app.close();
  });
  it('returns only owner offers and never attempts external auth on reads', async () => {
    const { app } = await setup();
    const fetch = vi.spyOn(globalThis, 'fetch');
    try {
      const res = await app.inject('/ads-intelligence');
      expect(res.statusCode).toBe(200);
      expect(res.json().offers.map((o: any) => o.id)).toEqual(['a']);
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
      await app.close();
    }
  });
  it('forbids member connection access', async () => {
    const { app, sql } = await setup('member');
    const res = await app.inject('/ads-intelligence');
    expect(res.statusCode).toBe(403);
    expect(sql).not.toHaveBeenCalled();
    await app.close();
  });
  it('refuses mapping to another owner', async () => {
    const { app, sql } = await setup();
    const res = await app.inject({
      method: 'PUT',
      url: '/ads-intelligence/mappings',
      payload: { campaign_key: 'campaign', offer_id: 'b' },
    });
    expect(res.statusCode).toBe(403);
    expect(sql).not.toHaveBeenCalled();
    await app.close();
  });
  it('rejects missing credentials without writing config', async () => {
    const { app, sql } = await setup();
    const res = await app.inject({
      method: 'PUT',
      url: '/ads-intelligence/connection',
      payload: { dashboard_id: 'dash' },
    });
    expect(res.statusCode).toBe(400);
    expect(sql).not.toHaveBeenCalled();
    await app.close();
  });
  it('encrypts credentials and returns no secret', async () => {
    const { app, sql } = await setup();
    const res = await app.inject({
      method: 'PUT',
      url: '/ads-intelligence/connection',
      payload: { dashboard_id: 'dash', login: 'private-login', password: 'private-password' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.stringify(sql.mock.calls)).not.toContain('private-password');
    expect(res.body).not.toContain('private');
    await app.close();
  });
});
