import Fastify from 'fastify';
import {describe,it,expect,vi} from 'vitest';
vi.mock('../src/env.js',()=>({env:{LOG_LEVEL:'silent',NODE_ENV:'test'}}));
import routes from '../src/routes/tracking-admin.js';
describe('tracking attribution page enrichment',()=>{
  it('keeps journey metrics unchanged and queries saved pages by the offer owner, not invited viewer',async()=>{
    const app=Fastify();const sql=vi.fn(async()=>[]);
    sql.mockResolvedValueOnce([{ad_id:'ad',campaign_id:'campaign',source:'FB',page_metadata:[{}],page_views:10,visitors:7,checkouts:2,paid_orders:1,paid_revenue_minor:'25000'}] as never)
      .mockResolvedValueOnce([{raw:{platform:'meta',adId:'ad',campaignId:'campaign',adAccountId:'acc',pageName:'Page',pageId:'123'}}] as never);
    app.decorate('db',sql);app.decorate('offerStore',{assertAccess:async()=>{},get:async()=>({id:'offer',userId:'owner'})});
    app.decorate('analyticsCache',{getOrSet:async(_key:any,fn:Function)=>fn()});
    app.addHook('preHandler',async req=>{(req as any).user={sub:'guest',role:'user'};});
    await app.register(routes);
    const fetch=vi.spyOn(globalThis,'fetch');
    try {
      const response=await app.inject('/offers/offer/tracking/attribution?date=2026-10-12');
      expect(response.statusCode).toBe(200);
      expect(response.json().rows[0]).toEqual({ad_id:'ad',campaign_id:'campaign',source:'FB',page_views:10,visitors:7,checkouts:2,paid_orders:1,paid_revenue_minor:'25000',page_name:'Page',page_id:'123'});
      expect(sql.mock.calls[1].slice(1)).toEqual(['owner',['ad']]);
      const metricsSQL=Array.from(sql.mock.calls[0][0] as any).join('');
      expect(metricsSQL).toContain('GROUP BY source, campaign_name, campaign_id, adset_name, adset_id, ad_name, ad_id, placement');
      expect(fetch).not.toHaveBeenCalled();
    }finally{fetch.mockRestore();await app.close();}
  });
});
