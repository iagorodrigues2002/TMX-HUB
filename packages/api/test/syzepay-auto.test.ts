import { describe, it, expect, vi } from 'vitest';
vi.mock('../src/env.js', () => ({env:{LOG_LEVEL:'error',NODE_ENV:'test'}}));
import { matchSyzepayExample } from '../src/services/syzepay-auto.js';
const target = {projectId:'p',storeId:'s',providerKind:'upsell',currency:'BRL',amount:12035};
const example = {...target,amount:12034,kind:'upsell_2' as const};
describe('SyzePay learned classification', () => {
  it('matches a manually classified example within bounded rounding/FX margin', () => {
    expect(matchSyzepayExample(target,[example])).toBe('upsell_2');
  });
  it.each(['projectId','storeId','providerKind','currency'] as const)('never crosses %s boundaries', key => {
    expect(matchSyzepayExample({...target,[key]:'different'},[example])).toBeNull();
  });
  it('leaves conflicting stages, unknown prices and no examples pending', () => {
    expect(matchSyzepayExample(target,[example,{...example,kind:'upsell'}])).toBeNull();
    expect(matchSyzepayExample({...target,amount:13000},[example])).toBeNull();
    expect(matchSyzepayExample(target,[])).toBeNull();
  });
});
