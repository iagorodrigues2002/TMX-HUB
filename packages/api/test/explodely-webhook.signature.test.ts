import { createHmac } from 'node:crypto';
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import explodelyWebhookRoutes from '../src/routes/webhooks-explodely.js';

describe('Explodely webhook signature', () => {
  it('rejects an invalid signature and accepts a valid HMAC over the raw body', async () => {
    const app = Fastify();
    const secret = 'explodely-test-secret';
    const received: string[] = [];
    await app.register(explodelyWebhookRoutes, {
      requireSignature: true,
      webhookSecret: secret,
      persistReceipt: async ({ receiptId }) => {
        received.push(receiptId);
        return { duplicate: false };
      },
      enqueue: async () => undefined,
    });
    const payload = JSON.stringify({ type: 'sale', orderid: 'signed-sale', vendor_id: 'vendor-a' });
    const invalid = await app.inject({
      method: 'POST',
      url: '/webhooks/explodely',
      headers: { 'content-type': 'application/json', 'x-explodely-signature': '00'.repeat(32) },
      payload,
    });
    expect(invalid.statusCode).toBe(401);
    const signature = createHmac('sha256', secret).update(payload).digest('hex');
    const valid = await app.inject({
      method: 'POST',
      url: '/webhooks/explodely',
      headers: { 'content-type': 'application/json', 'x-signature': signature },
      payload,
    });
    expect(valid.statusCode).toBe(200);
    expect(received).toHaveLength(1);
    await app.close();
  });

  it('accepts the previous secret and emits a rotation warning', async () => {
    const logLines: string[] = [];
    const app = Fastify({
      logger: {
        level: 'warn',
        stream: { write: (line: string) => logLines.push(line) },
      },
    });
    const currentSecret = 'explodely-current-secret';
    const previousSecret = 'explodely-previous-secret';
    await app.register(explodelyWebhookRoutes, {
      requireSignature: true,
      webhookSecret: currentSecret,
      webhookSecretPrevious: previousSecret,
      persistReceipt: async () => ({ duplicate: false }),
      enqueue: async () => undefined,
    });
    const payload = JSON.stringify({
      type: 'sale',
      orderid: 'rotated-sale',
      vendor_id: 'vendor-a',
    });
    const signature = createHmac('sha256', previousSecret).update(payload).digest('hex');

    const response = await app.inject({
      method: 'POST',
      url: '/webhooks/explodely',
      headers: { 'content-type': 'application/json', 'x-explodely-signature': signature },
      payload,
    });

    expect(response.statusCode).toBe(200);
    expect(logLines.join('\n')).toContain('previous webhook secret');
    await app.close();
  });
});
