import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { HttpProblem } from '../src/lib/problem.js';
import errorHandlerPlugin from '../src/plugins/error-handler.js';
import trackingAdvancedRoutes, { mergeAdvancedGateways } from '../src/routes/tracking-advanced.js';

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
