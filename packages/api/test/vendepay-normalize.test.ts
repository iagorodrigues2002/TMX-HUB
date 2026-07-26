import { describe, expect, it } from 'vitest';
import { normalizeVendepay } from '../src/integrations/vendepay/normalize.js';

describe('normalizeVendepay', () => {
  it('normaliza venda aprovada e preserva o src do tracker', () => {
    const result = normalizeVendepay(
      {
        event_id: 'evt-1',
        transaction_id: 'tx-123',
        status: 'approved',
        amount: '99.90',
        currency: 'usd',
        src: 'visitor-abc',
        customer: { name: 'Buyer', email: ' BUYER@EXAMPLE.COM ' },
        paid_at: '2026-07-26T12:00:00.000Z',
      },
      new Date('2026-07-26T13:00:00.000Z'),
    );
    expect(result.kind).toBe('processable');
    if (result.kind !== 'processable') return;
    expect(result.event).toMatchObject({
      transactionId: 'tx-123',
      status: 'paid',
      amountMinor: 9990,
      currency: 'USD',
      trackingSrc: 'visitor-abc',
      buyer: { name: 'Buyer', email: 'buyer@example.com' },
    });
  });

  it('extrai campos aninhados conhecidos', () => {
    const result = normalizeVendepay({
      data: {
        transaction_id: 456,
        status: 'PAGO',
        src: 'visitor-nested',
        amount: 10,
      },
    });
    expect(result.kind).toBe('processable');
    if (result.kind !== 'processable') return;
    expect(result.event.transactionId).toBe('456');
    expect(result.event.status).toBe('paid');
    expect(result.event.trackingSrc).toBe('visitor-nested');
  });

  it('coloca payload sem transação em quarentena', () => {
    const result = normalizeVendepay({ event: 'something', status: 'unknown' });
    expect(result.kind).toBe('quarantined');
    if (result.kind !== 'quarantined') return;
    expect(result.reason).toBe('missing_transaction_id');
  });

  it('gera a mesma chave para o mesmo evento normalizado', () => {
    const first = normalizeVendepay(
      { transaction_id: 'tx-1', status: 'paid', amount: '25.50' },
      new Date('2026-07-26T12:00:00.000Z'),
    );
    const second = normalizeVendepay(
      { amount: '25.50', status: 'paid', transaction_id: 'tx-1' },
      new Date('2026-07-26T12:05:00.000Z'),
    );
    expect(first.dedupeKey).toBe(second.dedupeKey);
  });
});
