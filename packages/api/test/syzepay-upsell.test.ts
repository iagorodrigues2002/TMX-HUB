import {it,expect,vi,afterEach} from 'vitest';
import {buildSyzepayRecoveryUrl,validateSyzepayRecovery} from '../src/services/syzepay-upsell.js';
afterEach(()=>vi.unstubAllGlobals());
it('uses SyzePay session instead of VendePay identity',()=>{
  const u=new URL(buildSyzepayRecoveryUrl('https://page.test/up?vendaId=wrong','session-a','step-a'));
  expect(u.searchParams.get('s')).toBe('session-a');expect(u.searchParams.get('step')).toBe('step-a');expect(u.searchParams.has('vendaId')).toBe(false);
});
it('only performs read-only session checks and requires a matching page',async()=>{
  const request=vi.fn(async()=>({ok:true,json:async()=>({mode:'live',status:'completed',funnelSteps:[{id:'step-a',behavior:{external_page_enabled:true,external_page_url:'https://page.test/up'}}]})}));
  vi.stubGlobal('fetch',request);
  expect((await validateSyzepayRecovery('https://page.test/up','valid-session')).compatible).toBe(true);
  expect((await validateSyzepayRecovery('https://other.test/up','other-session')).compatible).toBe(false);
  expect(request.mock.calls.every(call=>!((call as any)[1]?.method))).toBe(true);
});
