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
  it('shows healthy data in partial state but never calculates ROAS over missing account costs', async()=>{
    const {app,sql}=await setup();
    sql.mockResolvedValueOnce([{state:'partial',last_sync_at:'2026-10-13',coverage_from:'2026-08-01',coverage_to:'2026-10-12',coverage_complete:false,account_failures:[{platform:'meta',account_id:'bad',reason:'COULD_NOT_CONVERT_CURRENCY'}]}] as never)
      .mockResolvedValueOnce([{day:'2026-08-01',raw:{platform:'meta',name:'AD5-L17',adId:'a',adAccountId:'acc',campaignName:'PJR_ENG',spend:10000},currency:'BRL'}] as never)
      .mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const r=await app.inject('/ads-intelligence'); const data=r.json();
    expect(data.batches).toHaveLength(1);
    expect(data.batches[0].totals).toMatchObject({spend:100,roi:null,roas:null});
    expect(data.batches[0].ads[0]).toMatchObject({spend:100,roi:null,roas:null});
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
  it('preserves unknown hook rate and hides ROAS if unresolved traffic remains', async () => {
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
      roi: null,
      roas: null,
    });
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
