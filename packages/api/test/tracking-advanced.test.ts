import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { HttpProblem } from '../src/lib/problem.js';
import errorHandlerPlugin from '../src/plugins/error-handler.js';
import trackingAdvancedRoutes, { mergeAdvancedGateways } from '../src/routes/tracking-advanced.js';

describe('advanced tracking gateways', () => {
  it('reports SyzePay purchase origins without VendePay validation or recovery links', async () => {
    const app = Fastify();
    const query = async (strings: TemplateStringsArray) => {
      const sql = strings.join('?');
      if (sql.includes('SELECT id, public_key FROM tracking_projects')) return [{id:'project-a',public_key:'key-a'}];
      if (sql.includes('SELECT o.id,o.visitor_id,o.external_id')) {
        expect(sql).toContain('o.provider');
        expect(sql).toContain('LEFT JOIN syzepay_company_connections');
        expect(sql).toContain("WHEN o.provider='syzepay' THEN sc.name");
        return [{id:'order-a',provider:'syzepay',syzepay_session_id:'session-a',external_id:'syze-order',paid_at:new Date(),connection_name:'SyzePay TMX',confirmed_vendid_encrypted:null,validation_state:null,has_upsell:true,purchased_stage_keys:[]}];
      }
      if (sql.includes('FROM tracking_upsell_stages')) return [{id:'stage-a',stage_key:'upsell_1',name:'Upsell 1',slug:'slug-a',connection_destinations:{'gateway:syzepay':'https://page.test/syze'},destination_url:'https://page.test/vendepay'}];
      if (sql.includes('count(*)')) return [{total:1}];
      return [];
    };
    app.decorate('db', query);
    app.decorate('offerStore', {assertAccess:async()=>({id:'offer-a'})});
    app.addHook('preHandler', async req => { (req as any).user={sub:'owner-a',role:'user'}; });
    await app.register(trackingAdvancedRoutes);
    try {
      const response = await app.inject({method:'GET',url:'/offers/offer-a/tracking/upsell-identities'});
      expect(response.statusCode).toBe(200);
      expect(response.json().items[0]).toMatchObject({provider:'syzepay',connection_name:'SyzePay TMX',validation_state:'not_applicable',vendid_confirmed:false});
      expect(response.json().items[0].links).toHaveLength(1);
      const link = response.json().items[0].links[0];
      expect(link.gateway).toBe('syzepay');
      expect(new URL(link.url).searchParams.get('s')).toBe('session-a');
      expect(link.url).not.toContain('vendaId');
    } finally { await app.close(); }
  });
  it('keeps managed Vendepay connections without duplicating the universal provider', () => {
    const gateways = [
      { id: 'universal-vendepay', provider: 'vendepay', enabled: true },
      { id: 'paysight', provider: 'paysight', enabled: true },
    ];
    const vendepayConnections = [
      { id: 'vendepay-primary', name: 'Conta principal', enabled: true },
      { id: 'vendepay-secondary', name: 'Conta secundária', enabled: true },
    ];

    expect(mergeAdvancedGateways(gateways, vendepayConnections)).toEqual([
      { id: 'paysight', provider: 'paysight', enabled: true },
      {
        id: 'vendepay-primary',
        name: 'Conta principal',
        enabled: true,
        provider: 'vendepay',
        managed: true,
      },
      {
        id: 'vendepay-secondary',
        name: 'Conta secundária',
        enabled: true,
        provider: 'vendepay',
        managed: true,
      },
    ]);
  });

  it('returns 403 when a regular member creates an advanced tracking gateway', async () => {
    const app = Fastify();
    app.decorate('db', null);
    app.decorate('offerStore', {
      assertTrackingManager: async () => {
        throw new HttpProblem({
          status: 403,
          title: 'Forbidden',
          code: 'offer_role_forbidden',
        });
      },
    });
    app.addHook('preHandler', async (request) => {
      (request as typeof request & { user: { sub: string; role: string } }).user = {
        sub: 'member-1',
        role: 'user',
      };
    });
    await app.register(errorHandlerPlugin);
    await app.register(trackingAdvancedRoutes);

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/offers/offer-1/tracking/gateways',
        payload: { provider: 'cooud', propagation_param: 'src' },
      });
      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ code: 'offer_role_forbidden' });
    } finally {
      await app.close();
    }
  });
});
