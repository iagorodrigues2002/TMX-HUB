import { describe, expect, it } from 'vitest';
import { explodelyEventPlan, normalizeExplodely } from '../src/integrations/explodely/normalize.js';

describe('Explodely refund lifecycle', () => {
  it('updates the sale order instead of creating a second order', () => {
    const saleRaw = Buffer.from('type=sale&orderid=order-9');
    const refundRaw = Buffer.from('type=refund&orderid=order-9');
    const sale = normalizeExplodely({ type: 'sale', orderid: 'order-9' }, saleRaw);
    const refund = normalizeExplodely({ type: 'refund', orderid: 'order-9' }, refundRaw);
    expect(sale.kind).toBe('processable');
    expect(refund.kind).toBe('processable');
    if (sale.kind !== 'processable' || refund.kind !== 'processable') return;
    expect(sale.event.externalId).toBe(refund.event.externalId);
    expect(sale.event.transactionId).not.toBe(refund.event.transactionId);
    expect(explodelyEventPlan(sale.event.kind)).toMatchObject({
      orderAction: 'upsert',
      status: 'paid',
    });
    expect(explodelyEventPlan(refund.event.kind)).toMatchObject({
      orderAction: 'update',
      status: 'refunded',
    });
  });
});
