import { describe, expect, it } from 'vitest';
import { normalizeVendepayWebhook } from '../src/integrations/vendepay/explodely-compat.js';

describe('Vendepay Explodely compatibility bridge', () => {
  const explodelySale = {
    orderid: 'explodely-order-1',
    type: 'sale',
    amount: '47.00',
    productId: 'rws-front',
    productName: 'RWS',
    customerEmail: 'buyer@example.com',
    tid: 'tmx-token',
  };

  it('only accepts the Explodely shape when explicitly enabled', () => {
    expect(normalizeVendepayWebhook(explodelySale, false)).toMatchObject({
      kind: 'quarantined',
    });
    const normalized = normalizeVendepayWebhook(explodelySale, true);
    expect(normalized.kind).toBe('processable');
    if (normalized.kind !== 'processable') return;
    expect(normalized.event).toMatchObject({
      transactionId: 'explodely-order-1',
      status: 'paid',
      amountMinor: 4700,
      currency: 'USD',
      trackingSrc: 'tmx-token',
      product: { id: 'rws-front', name: 'RWS' },
    });
  });

  it('preserves lifecycle transitions and a distinct event dedupe key', () => {
    const paid = normalizeVendepayWebhook(explodelySale, true);
    const refunded = normalizeVendepayWebhook(
      { ...explodelySale, type: 'refund', amount: '-47.00', refundtimestamp: '1760000000' },
      true,
    );
    expect(paid.kind).toBe('processable');
    expect(refunded.kind).toBe('processable');
    if (paid.kind !== 'processable' || refunded.kind !== 'processable') return;
    expect(refunded.event.status).toBe('refunded');
    expect(refunded.dedupeKey).not.toBe(paid.dedupeKey);
  });
});
