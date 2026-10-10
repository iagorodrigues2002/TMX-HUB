import {it,expect} from 'vitest';
import {upsellOrigin} from '../src/services/upsell-origin.js';
it('shows SyzePay and never schedules VendePay validation for it',()=>{
  expect(upsellOrigin('syzepay','SyzePay TMX')).toEqual({connection_name:'SyzePay TMX',vendepay_validation_applicable:false});
  expect(upsellOrigin('syzepay',null).connection_name).toBe('SyzePay');
});
it('preserves VendePay account labels and uses each other gateway honestly',()=>{
  expect(upsellOrigin('vendepay','VendePay Mainex')).toEqual({connection_name:'VendePay Mainex',vendepay_validation_applicable:true});
  expect(upsellOrigin('explodely',null).connection_name).toBe('Explodely');
  expect(upsellOrigin('paysight',null).connection_name).toBe('Paysight');
});
