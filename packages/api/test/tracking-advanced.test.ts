import { describe, expect, it } from 'vitest';
import { mergeAdvancedGateways } from '../src/routes/tracking-advanced.js';

describe('advanced tracking gateways', () => {
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
});
