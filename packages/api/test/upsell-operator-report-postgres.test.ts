import {randomUUID} from 'node:crypto';
import Fastify from 'fastify';
import postgres from 'postgres';
import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {registerUpsellOperatorAudit} from '../src/routes/upsell-operator-audit.js';

// Requires migrations on a disposable local database; no DATABASE_URL fallback.
const url=process.env.ATTRIBUTION_REPORT_TEST_DATABASE_URL;
describe.skipIf(!url)('operator report end-to-end (local PostgreSQL)',()=>{
  const db=postgres(url??'postgres://unused',{max:1});
  const id=`report-test-${randomUUID()}`;
  beforeAll(async()=>{
    await db`INSERT INTO tracking_projects(id,offer_id,public_key) VALUES(${id},${id},${id})`;
    await db`INSERT INTO vendepay_connections(id,project_id,token_hash) VALUES(${id},${id},${id})`;
    await db`INSERT INTO tracking_orders(id,project_id,provider,external_id,status,order_kind,paid_at,occurred_at,visitor_id,vendepay_connection_id)
      VALUES(${id+'-front'},${id},'vendepay',${id+'-front'},'paid','front',now()-interval '30 minutes',now()-interval '30 minutes',${id},${id})`;
    for(const [operator,minutes]of [['first',20],['winner',10]] as const)
      await db`INSERT INTO tracking_upsell_operator_attempts(id,project_id,order_id,stage_id,stage_key,provider,operator_id,click_id,opened_at)
        VALUES(${id+operator},${id},${id+'-front'},'s','upsell_1','vendepay',${operator},${id+operator},now()-${minutes}*interval '1 minute')`;
    await db`INSERT INTO tracking_orders(id,project_id,provider,external_id,status,order_kind,paid_at,occurred_at,visitor_id,vendepay_connection_id,amount_minor,amount_brl_minor,currency)
      VALUES(${id+'-upsell'},${id},'vendepay',${id+'-upsell'},'paid','upsell',now(),now(),${id},${id},2500,13000,'USD')`;
    await db`INSERT INTO webhook_receipts(id,connection_id,dedupe_key,payload,state,order_id)
      VALUES(${id},${id},${id},${db.json({transaction_id:id+'-upsell',status:'paid'})},'processed',${id+'-upsell'})`;
  });
  afterAll(async()=>{await db`DELETE FROM tracking_projects WHERE id=${id}`;await db.end();});
  const report=async(user:string,admin:boolean)=>{
    const app=Fastify();
    app.decorate('db',db);
    app.decorate('offerStore',{assertAccess:async()=>({id})});
    app.decorate('userStore',{maybeGetById:async(user:string)=>({name:user==='winner'?'Pessoa vencedora':'Primeira pessoa'})});
    app.addHook('preHandler',async req=>{req.user={sub:user,role:admin?'admin':'user'} as any;});
    registerUpsellOperatorAudit(app);
    try{const r=await app.inject(`/offers/${id}/tracking/upsell-operator-logs`);expect(r.statusCode).toBe(200);return r.json();}
    finally{await app.close();}
  };
  it('joins real paid proof, immutable winner and BRL totals through the actual report SQL',async()=>{
    const result=await report('admin',true);
    expect(result.summary).toHaveLength(2);
    expect(result.summary[0]).toMatchObject({operator_id:'winner',operator_name:'Pessoa vencedora',confirmed_purchases:1,amounts:[{currency:'BRL',amount_minor:13000}]});
    expect(result.summary[1]).toMatchObject({operator_id:'first',confirmed_purchases:0});
    expect(result.approvals[0].operator_id).toBe('winner');
  });
  it('does not assign an earlier click to a member or expose someone else’s approval',async()=>{
    const result=await report('first',false);
    expect(result.summary).toHaveLength(1);
    expect(result.summary[0]).toMatchObject({operator_id:'first',confirmed_purchases:0});
    expect(result.approvals).toEqual([]);
    expect(JSON.stringify(result)).not.toContain('Pessoa vencedora');
    const winner=await report('winner',false);
    expect(winner.summary[0].confirmed_purchases).toBe(1);
  });
});
