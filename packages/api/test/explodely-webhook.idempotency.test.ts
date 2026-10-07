import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import explodelyWebhookRoutes from '../src/routes/webhooks-explodely.js';

describe('Explodely webhook idempotency', () => {
  it('acknowledges a duplicate transaction without enqueueing it twice', async () => {
    const app = Fastify();
    const seen = new Set<string>();
    const enqueued: string[] = [];
    await app.register(explodelyWebhookRoutes, {
      requireSignature: false,
      persistReceipt: async ({ transactionId }) => {
        const duplicate = seen.has(transactionId);
        seen.add(transactionId);
        return { duplicate };
      },
      enqueue: async (receiptId) => {
        enqueued.push(receiptId);
      },
    });
    const request = {
      method: 'POST' as const,
      url: '/webhooks/explodely',
      payload: { type: 'sale', orderid: 'sale-idempotent', vendor_id: 'vendor-a' },
    };
    const first = await app.inject(request);
    const second = await app.inject(request);
    expect(first.statusCode).toBe(200);
    expect(first.json().duplicate).toBe(false);
    expect(second.statusCode).toBe(200);
    expect(second.json().duplicate).toBe(true);
    expect(enqueued).toHaveLength(1);
    await app.close();
  });
});
