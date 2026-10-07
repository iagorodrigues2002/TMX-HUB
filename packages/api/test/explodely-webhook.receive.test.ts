import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { env } from '../src/env.js';
import explodelyWebhookRoutes from '../src/routes/webhooks-explodely.js';

describe('Explodely webhook receive', () => {
  const apps: Array<ReturnType<typeof Fastify>> = [];
  const originalPayloadScrub = env.WEBHOOK_PAYLOAD_SCRUB;
  afterEach(async () => {
    env.WEBHOOK_PAYLOAD_SCRUB = originalPayloadScrub;
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

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

  it('scrubs PII from JSON and raw storage when the opt-in is enabled', async () => {
    env.WEBHOOK_PAYLOAD_SCRUB = true;
    const app = Fastify();
    apps.push(app);
    let savedRaw = '';
    let savedPayload: Record<string, unknown> = {};
    await app.register(explodelyWebhookRoutes, {
      requireSignature: false,
      persistReceipt: async (input) => {
        savedRaw = input.rawBody;
        savedPayload = input.payload;
        return { duplicate: false };
      },
      enqueue: async () => undefined,
    });
    const response = await app.inject({
      method: 'POST',
      url: '/webhooks/explodely',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload:
        'type=sale&orderid=sale-101&customerEmail=buyer%40example.com&customerPhone=5511999&amount=49.90',
    });

    expect(response.statusCode).toBe(200);
    expect(savedRaw).toBe('type=sale&orderid=sale-101&amount=49.90');
    expect(savedPayload).toEqual({ type: 'sale', orderid: 'sale-101', amount: '49.90' });
  });
});
