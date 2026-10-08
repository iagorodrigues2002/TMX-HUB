import { describe,it,expect,vi } from 'vitest';
import { validateUpsellCandidates, canRetryUpsellValidation } from '../src/services/upsell-identity-validation.js';

const result=(compatible:boolean,state:'recoverable'|'temporary_failure'|'definitive_failure')=>({
  compatible,state,reason:state,attempts:1,httpStatus:compatible?200:404,
});
describe('automatic upsell identity validation',()=>{
  it('never retries after the second attempt, including legacy jobs',()=>{
    expect(canRetryUpsellValidation(1)).toBe(true);
    expect(canRetryUpsellValidation(2)).toBe(false);
    expect(canRetryUpsellValidation(6)).toBe(false);
  });
  it('accepts only an id confirmed by a configured destination',async()=>{
    const check=vi.fn().mockResolvedValueOnce(result(false,'definitive_failure'))
      .mockResolvedValueOnce(result(true,'recoverable'));
    expect(await validateUpsellCandidates(['transaction','buyer'],['account-url'],check))
      .toMatchObject({vendid:'buyer',temporary:false});
    expect(check).toHaveBeenNthCalledWith(2,'account-url','buyer');
  });
  it('retries transient failures even if another stage definitively rejected the id',async()=>{
    const check=vi.fn().mockResolvedValueOnce(result(false,'temporary_failure'))
      .mockResolvedValueOnce(result(false,'definitive_failure'));
    expect(await validateUpsellCandidates(['buyer'],['a','b'],check))
      .toMatchObject({temporary:true,reason:'vendepay_temporarily_unavailable'});
  });
  it('does not confirm rejected transactions',async()=>{
    const check=vi.fn().mockResolvedValue(result(false,'definitive_failure'));
    expect(await validateUpsellCandidates(['transaction'],['a'],check))
      .toMatchObject({temporary:false});
    expect((await validateUpsellCandidates(['transaction'],['a'],check)).vendid).toBeUndefined();
  });
  it('does not call the provider if the account has no configured destination',async()=>{
    const check=vi.fn();
    expect(await validateUpsellCandidates(['buyer'],[],check))
      .toMatchObject({temporary:true,reason:'account_destination_not_configured'});
    expect(check).not.toHaveBeenCalled();
  });
});
