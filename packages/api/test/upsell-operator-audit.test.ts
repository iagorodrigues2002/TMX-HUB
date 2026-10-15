import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { encryptSecret } from '../src/lib/secret-box.js';
import { HttpProblem } from '../src/lib/problem.js';
import errorHandlerPlugin from '../src/plugins/error-handler.js';
import { hasGatewayApproval, operatorAuditSummary, registerUpsellOperatorAudit } from '../src/routes/upsell-operator-audit.js';
import { validateSyzepayRecovery } from '../src/services/syzepay-upsell.js';

vi.mock('../src/env.js', () => ({ env: { TRACKING_ENCRYPTION_KEY: 'test-key-longer-than-thirty-two-characters', TRACKING_PUBLIC_BASE_URL: 'https://tmx.test' } }));
vi.mock('../src/services/syzepay-upsell.js', async importOriginal => ({...await importOriginal<typeof import('../src/services/syzepay-upsell.js')>(),validateSyzepayRecovery: vi.fn(async () => ({compatible:true,url:'https://checkout.test/upsell?s=session-secret&step=real-step'})) }));

const now = new Date('2026-10-15T12:00:00Z');
const attempt = { id:'attempt-1',operator_id:'member-1',order_id:'front-1',stage_id:'stage-1',stage_key:'upsell_1',provider:'vendepay',opened_at:now };
const approval = {order_id:'paid-upsell',stage_key:'upsell_1',provider:'vendepay',approved_at:now,amount_minor:2500,currency:'USD'};

async function fixture(options: { user?: string; deny?: boolean; provider?: string; unsafe?: boolean } = {}) {
  const app=Fastify();
  const inserted: any[]=[];
  const statements: string[]=[];
  app.decorate('db',async (strings: TemplateStringsArray,...values: any[]) => {
    const sql=strings.join('?'); statements.push(sql);
    if(sql.includes('SELECT id FROM tracking_projects'))return [{id:'project-1'}];
    if(sql.includes('o.id AS order_id,s.id AS stage_id'))return [{order_id:values[1],stage_id:values[2],stage_key:'upsell_1',provider:options.provider??'vendepay',slug:'slug-1',session_id:'session-secret',syzepay_destination:'https://checkout.test/upsell',vendid_encrypted:encryptSecret('venda-secret','test-key-longer-than-thirty-two-characters')}];
    if(sql.includes('INSERT INTO tracking_upsell_operator_attempts')) {
      if(inserted.length)return [];
      const row={...attempt,id:values[0],operator_id:values[6]}; inserted.push(row); return [row];
    }
    if(sql.includes('click_id=?'))return inserted;
    if(sql.includes('SELECT id,operator_id,order_id,stage_id,stage_key,provider,opened_at FROM tracking_upsell_operator_attempts') && sql.includes('ORDER BY'))return [{...attempt,operator_id:options.user??'owner-1'}];
    if(sql.includes('FROM tracking_orders o')) {
      expect(sql).toContain("r.state='processed'");
      expect(sql).toContain("r.authenticity='signature_verified'");
      expect(sql).toContain('r.tracking_order_id=o.id');
      expect(sql).toContain('r.order_id=o.id');
      expect(sql).not.toContain('tracking_upsell_manual_test_results');
      return [{...approval,receipt_payloads:[{transaction_id:'real-transaction',status:'paid'}]},{...approval,order_id:'syze-upsell',provider:'syzepay',currency:'BRL',amount_minor:12417,receipt_payloads:null}];
    }
    return [];
  });
  app.decorate('offerStore',{assertAccess:async()=>{
    if(options.deny)throw new HttpProblem({status:404,title:'Not found',code:'offer_not_found'});
    return {userId:'owner-1'};
  }});
  app.decorate('userStore',{maybeGetById:async()=>({name:'Operador TMX',email:'do-not-expose@test'})});
  app.addHook('preHandler',async req=>{(req as any).user={sub:options.user??'owner-1',role:'user'};});
  await app.register(errorHandlerPlugin);
  registerUpsellOperatorAudit(app);
  return {app,inserted,statements};
}

const openUrl='/offers/offer-1/tracking/upsell-identities/front-1/stages/stage-1/open';
const logUrl='/offers/offer-1/tracking/upsell-operator-logs';
describe('upsell operator audit',()=>{
  it.each(['GET','POST'] as const)('requires an authenticated session for %s',async method=>{
    const app=Fastify();registerUpsellOperatorAudit(app);
    try {
      const response=await app.inject({method,url:method==='GET'?logUrl:openUrl});
      expect(response.statusCode).toBe(401);
    } finally {await app.close();}
  });
  it('durably registers an opening before returning the existing VendePay URL, without URL/PII in storage',async()=>{
    const {app,inserted,statements}=await fixture();
    try {
      const response=await app.inject({method:'POST',url:openUrl,payload:{click_id:'click_1234567890123456'}});
      expect(response.statusCode).toBe(200);
      expect(response.json().url).toBe('https://tmx.test/v1/u/slug-1?vendaId=venda-secret');
      expect(inserted).toHaveLength(1);
      expect(statements.find(s=>s.includes('INSERT'))).not.toMatch(/url|buyer|email|session_id|vendid/);
      expect(response.headers['cache-control']).toContain('no-store');
    } finally {await app.close();}
  });
  it('retries the same click idempotently, with conflict guarded by operator, project and target',async()=>{
    const {app,inserted,statements}=await fixture();
    try {
      const request={method:'POST' as const,url:openUrl,payload:{click_id:'click_1234567890123456'}};
      const first=await app.inject(request), second=await app.inject(request);
      expect(second.json().attempt_id).toBe(first.json().attempt_id);
      expect(inserted).toHaveLength(1);
      expect(statements.find(s=>s.includes('INSERT'))).toContain('ON CONFLICT(project_id,operator_id,click_id) DO NOTHING');
    } finally {await app.close();}
  });
  it('records the authenticated guest, never a client-supplied operator',async()=>{
    const {app,inserted}=await fixture({user:'member-1'});
    try {
      const invalid=await app.inject({method:'POST',url:openUrl,payload:{click_id:'click_1234567890123456',operator_id:'owner-1'}});
      expect(invalid.statusCode).toBe(422);expect(inserted).toHaveLength(0);
      await app.inject({method:'POST',url:openUrl,payload:{click_id:'click_1234567890123456'}});
      expect(inserted[0].operator_id).toBe('member-1');
    } finally {await app.close();}
  });
  it('keeps the validated SyzePay session and step',async()=>{
    const {app}=await fixture({provider:'syzepay'});
    try {
      const response=await app.inject({method:'POST',url:openUrl,payload:{click_id:'click_1234567890123456'}});
      expect(response.statusCode).toBe(200);
      expect(response.json().url).toBe('https://checkout.test/upsell?s=session-secret&step=real-step');
    } finally {await app.close();}
  });
  it('preserves the prior already-purchased SyzePay view-only action',async()=>{
    const {app}=await fixture({provider:'syzepay'});
    try {
      const response=await app.inject({method:'POST',url:openUrl,payload:{click_id:'click_1234567890123456',view_only:true}});
      expect(response.statusCode).toBe(200);
      expect(response.json().url).toBe('https://checkout.test/upsell?s=session-secret&force=1');
    } finally {await app.close();}
  });
  it('rejects reusing a click key for a different target',async()=>{
    const {app,inserted}=await fixture();
    try {
      await app.inject({method:'POST',url:openUrl,payload:{click_id:'click_1234567890123456'}});
      const response=await app.inject({method:'POST',url:openUrl.replace('front-1','front-2'),payload:{click_id:'click_1234567890123456'}});
      expect(response.statusCode).toBe(409);expect(inserted).toHaveLength(1);
    } finally {await app.close();}
  });
  it('refuses an unsafe checkout URL without writing an attempt',async()=>{
    vi.mocked(validateSyzepayRecovery).mockResolvedValueOnce({compatible:true,reason:'fixture',url:'http://checkout.test/upsell'});
    const {app,inserted}=await fixture({provider:'syzepay'});
    try {
      const response=await app.inject({method:'POST',url:openUrl,payload:{click_id:'click_1234567890123456'}});
      expect(response.statusCode).toBe(409);expect(inserted).toHaveLength(0);
    } finally {await app.close();}
  });
  it.each(['GET','POST'] as const)('denies cross-offer %s before querying or inserting audit data',async method=>{
    const {app,statements}=await fixture({deny:true});
    try {
      const response=await app.inject({method,url:method==='GET'?logUrl:openUrl,...(method==='POST'?{payload:{click_id:'click_1234567890123456'}}:{})});
      expect(response.statusCode).toBe(404);expect(statements).toHaveLength(0);
    } finally {await app.close();}
  });
  it('exposes only a member’s own openings and no offer-wide approvals',async()=>{
    const {app,statements}=await fixture({user:'member-1'});
    try {
      const response=await app.inject({method:'GET',url:logUrl});
      expect(response.json()).toMatchObject({scope:'self',approvals:[],summary_scope:'displayed_rows'});
      expect(response.json().attempts[0]).toMatchObject({operator_id:'member-1',operator_name:'Operador TMX'});
      expect(JSON.stringify(response.json())).not.toContain('do-not-expose');
      expect(statements.some(s=>s.includes('FROM tracking_orders o'))).toBe(false);
      expect(statements.some(s=>s.includes('OR operator_id=?'))).toBe(true);
    } finally {await app.close();}
  });
  it('shows gateway-paid purchases separately without assigning the only/latest operator',async()=>{
    const {app}=await fixture();
    try {
      const response=await app.inject({method:'GET',url:logUrl});
      expect(response.statusCode).toBe(200);
      expect(response.json().approvals.every((r:any)=>r.operator_id===null)).toBe(true);
      expect(response.json().unattributed_totals).toEqual([{currency:'USD',count:1,amount_minor:2500},{currency:'BRL',count:1,amount_minor:12417}]);
      expect(response.json().summary[0].confirmed_purchases).toBe(0);
    } finally {await app.close();}
  });
  it('never credits multiple operators or adds different currencies together',()=>{
    const summary=operatorAuditSummary([attempt,{...attempt,id:'attempt-2',operator_id:'member-2'}],[approval,{...approval,order_id:'other',currency:'EUR',amount_minor:3500}]);
    expect(summary.summary.every(s=>s.confirmed_purchases===0)).toBe(true);
    expect(summary.unattributed_totals).toEqual([{currency:'USD',count:1,amount_minor:2500},{currency:'EUR',count:1,amount_minor:3500}]);
  });
  it('does not invent a zero amount when payment value or currency is unknown',()=>{
    expect(operatorAuditSummary([],[{...approval,amount_minor:null,currency:null}]).unattributed_totals).toEqual([{currency:null,count:1,amount_minor:null}]);
  });
  it('rejects manual imports without paid receipts and a refund receipt retaining generic completed status',()=>{
    expect(hasGatewayApproval({...approval,receipt_payloads:[]})).toBe(false);
    expect(hasGatewayApproval({...approval,receipt_payloads:[{transaction_id:'real',status:'completed',event:'Reembolso'}]})).toBe(false);
    expect(hasGatewayApproval({...approval,receipt_payloads:[{transaction_id:'real',status:'completed',event:'Charge'}]})).toBe(false);
    expect(hasGatewayApproval({...approval,receipt_payloads:[{transaction_id:'real',status:'completed',event:'compra.aprovada'}]})).toBe(true);
  });
});
