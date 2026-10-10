import { describe, it, expect } from 'vitest';
import {
  gatewayOverviewForOffers,
  type GatewayOverviewRow,
} from '../src/services/gateway-overview.js';
const row = (offer_id: string, provider: string, amount: string): GatewayOverviewRow => ({
  offer_id,
  provider,
  transactions: 2,
  fronts: 1,
  upsells: 1,
  gross_brl_minor: amount,
  missing_amounts: 0,
});
describe('gateway overview scope', () => {
  it('separates owners by explicit allowed offer IDs', () => {
    expect(
      gatewayOverviewForOffers(
        [row('mine', 'vendepay', '1000'), row('guest', 'vendepay', '9000')],
        ['mine'],
      ),
    ).toEqual([
      {
        provider: 'vendepay',
        transactions: 2,
        fronts: 1,
        upsells: 1,
        gross_brl_minor: '1000',
        missing_amounts: 0,
      },
    ]);
  });
  it('aggregates each provider once and retains missing conversion warnings', () => {
    const result = gatewayOverviewForOffers(
      [
        row('a', 'vendepay', '1000'),
        row('b', 'vendepay', '2000'),
        { ...row('a', 'paysight', '4000'), missing_amounts: 1 },
      ],
      ['a', 'b'],
    );
    expect(result.find((r) => r.provider === 'vendepay')).toMatchObject({
      transactions: 4,
      gross_brl_minor: '3000',
      fronts: 2,
      upsells: 2,
    });
    expect(result.find((r) => r.provider === 'paysight')?.missing_amounts).toBe(1);
  });
  it('returns no foreign gateway revenue for an empty scope', () =>
    expect(gatewayOverviewForOffers([row('other', 'vendepay', '999')], [])).toEqual([]));
});
