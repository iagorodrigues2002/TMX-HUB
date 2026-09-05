import { describe, expect, it } from 'vitest';
import { collectCheckoutIds, collectVendaIdCandidates } from '../src/services/vendepay-venda-id.js';

describe('collectVendaIdCandidates', () => {
  it('ignores checkout configuration ids and keeps explicit vendaIds', () => {
    expect(collectVendaIdCandidates({
      checkoutId: '11111111-1111-4111-8111-111111111111',
      potentialCheckoutId: '22222222-2222-4222-8222-222222222222',
      data: { vendaId: '33333333-3333-4333-8333-333333333333' },
    })).toEqual(['33333333-3333-4333-8333-333333333333']);
  });

  it('identifies ids that belong to the checkout rather than the buyer', () => {
    expect(collectCheckoutIds({
      checkoutId: '11111111-1111-4111-8111-111111111111',
      nested: { idePotentialCheckoutId: '22222222-2222-4222-8222-222222222222' },
      vendaId: '33333333-3333-4333-8333-333333333333',
    })).toEqual([
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    ]);
  });

  it('uses the canonical transaction UUID only as the final fallback', () => {
    expect(collectVendaIdCandidates(
      { vendid: '44444444-4444-4444-8444-444444444444' },
      '55555555-5555-4555-8555-555555555555',
    )).toEqual([
      '44444444-4444-4444-8444-444444444444',
      '55555555-5555-4555-8555-555555555555',
    ]);
  });
});
