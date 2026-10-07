import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import explodelyWebhookRoutes from '../src/routes/webhooks-explodely.js';

describe('Explodely webhook receive', () => {
  const apps: Array<ReturnType<typeof Fastify>> = [];
  afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

  it('persists the raw sale before enqueueing it and acknowledges with HTTP 200', async () => {
    const app = Fastify();
    apps.push(app);
    const actions: string[] = [];
    let savedRaw = '';
    await app.register(explodelyWebhookRoutes, {
      requireSignature: false,
      persistReceipt: async (input) => {
        actions.push('persist');
        savedRaw = input.rawBody;
        expect(input.payload).toMatchObject({ type: 'sale', orderid: 'sale-100' });
        return { duplicate: false };
      },
      enqueue: async () => {
        actions.push('enqueue');
      },
    });
    const payload = 'type=sale&orderid=sale-100&vendor_id=vendor-a&amount=49.90';
    const response = await app.inject({
      method: 'POST',
      url: '/webhooks/explodely',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ accepted: true, duplicate: false });
    expect(savedRaw).toBe(payload);
    expect(actions).toEqual(['persist', 'enqueue']);
  });
});
