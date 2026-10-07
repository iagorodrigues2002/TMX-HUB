import { describe, expect, it } from 'vitest';
import { scrubWebhookPayload, scrubWebhookRawPayload } from '../src/lib/webhook-payload.js';

describe('webhook payload minimization', () => {
  it('deeply removes email, cpf and phone fields without mutating the input', () => {
    const original = {
      id: 'order-1',
      customer: {
        email: 'buyer@example.com',
        cpf: '12345678901',
        phone: '+5511999999999',
        name: 'Maria',
      },
      events: [{ customer_email: 'nested@example.com', amount: 100 }],
    };

    expect(scrubWebhookPayload(original)).toEqual({
      id: 'order-1',
      customer: { name: 'Maria' },
      events: [{ amount: 100 }],
    });
    expect(original.customer.email).toBe('buyer@example.com');
  });

  it('preserves the raw payload format while removing sensitive form fields', () => {
    expect(
      scrubWebhookRawPayload(
        'orderid=order-1&customerEmail=buyer%40example.com&customerPhone=5511999&amount=10',
        'application/x-www-form-urlencoded',
      ),
    ).toBe('orderid=order-1&amount=10');
  });
});
