import { describe, expect, it } from 'vitest';
import { normalizeExplodely } from '../src/integrations/explodely/normalize.js';

describe('normalizeExplodely', () => {
  it('normaliza a venda IPN e preserva o identificador de tracking', () => {
    const normalized = normalizeExplodely({
      orderid: 'ex-123',
      type: 'sale',
      amount: '29.90',
      productId: 'p-1',
      productName: 'Course',
      customerName: 'Ada Lovelace',
      customerEmail: 'ada@example.com',
      customerPhone: '+15550000',
      country: 'us',
      zipcode: '33166',
      tid: 'tmx-click',
      ipadd: '203.0.113.4',
      saletimestamp: '1760000000',
    });
    expect(normalized.kind).toBe('processable');
    if (normalized.kind !== 'processable') return;
    expect(normalized.event).toMatchObject({
      transactionId: 'ex-123',
      status: 'paid',
      amountMinor: 2990,
      currency: 'USD',
      trackingSrc: 'tmx-click',
      buyer: { email: 'ada@example.com', country: 'US' },
      product: { id: 'p-1', name: 'Course' },
    });
    expect(normalized.event.source).toMatchObject({ src: 'tmx-click', client_ip: '203.0.113.4' });
  });

  it.each([
    ['refund', 'refunded'],
    ['chargeback', 'chargeback'],
    ['charge back', 'chargeback'],
  ])('mantém a transição de ciclo %s', (type, status) => {
    const normalized = normalizeExplodely({
      orderid: 'ex-123',
      type,
      amount: '-29.90',
      refundtimestamp: '1760000000',
    });
    expect(normalized.kind).toBe('processable');
    if (normalized.kind === 'processable') expect(normalized.event.status).toBe(status);
  });

  it('aceita IDs de clique enviados pelo webhook moderno', () => {
    const normalized = normalizeExplodely({
      order_id: 'ex-1',
      event: 'sale',
      amount: 10,
      currency: 'EUR',
      tracking_id: 'visitor-1',
      gclid: 'gclid-1',
      fbc: 'fb.1.1.click',
      fbp: 'fb.1.1.browser',
      ttclid: 'ttclid-1',
      vtid: 'v3_player_variant',
      custom1: 'saved',
    });
    expect(normalized.kind).toBe('processable');
    if (normalized.kind !== 'processable') return;
    expect(normalized.event.currency).toBe('EUR');
    expect(normalized.event.source).toMatchObject({
      src: 'visitor-1',
      gclid: 'gclid-1',
      _fbc: 'fb.1.1.click',
      _fbp: 'fb.1.1.browser',
      ttclid: 'ttclid-1',
      vtid: 'v3_player_variant',
      custom1: 'saved',
    });
  });

  it('coloca payload sem pedido em quarentena', () => {
    const normalized = normalizeExplodely({ type: 'sale', amount: 10 });
    expect(normalized).toMatchObject({ kind: 'quarantined', reason: 'missing_order_id' });
  });
});
