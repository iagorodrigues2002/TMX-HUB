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
        payment_method: 'pix',
        product: { id: 'prod-1', name: 'Produto principal' },
        offer: { id: 'offer-1', name: 'Plano anual' },
        metadata: {
          utm_source: 'facebook',
          utm_campaign: 'campanha-1',
          campaign_id: '120',
          adset_id: '456',
          ad_id: '789',
          _fbc: 'fb.1.123.click',
        },
        customer: {
          name: 'Buyer',
          email: ' BUYER@EXAMPLE.COM ',
          address: { country: 'Brazil' },
        },
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
      buyer: { name: 'Buyer', email: 'buyer@example.com', country: 'BR' },
      paymentMethod: 'pix',
      product: {
        id: 'prod-1',
        name: 'Produto principal',
        planId: 'offer-1',
        planName: 'Plano anual',
      },
      source: {
        src: 'visitor-abc',
        utm_source: 'facebook',
        utm_campaign: 'campanha-1',
        campaign_id: '120',
        adset_id: '456',
        ad_id: '789',
        _fbc: 'fb.1.123.click',
      },
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

  it('normaliza o payload real em português da Vendepay mesmo com campos nulos', () => {
    const result = normalizeVendepay({
      id: 'charge-123',
      checkoutId: 'checkout-123',
      event: 'compra.aprovada',
      status: 2,
      valorPago: '25.18',
      moeda: 2,
      src: 'visitor-signed-token',
      metodoPagamento: 3,
      produtoId: 'product-123',
      nomeProduto: 'Produto principal',
      nomeComprador: 'Maria',
      emailComprador: ' MARIA@EXAMPLE.COM ',
      telefoneComprador: null,
      cpfComprador: null,
      utmSource: 'facebook',
      utmCampaign: 'campanha-real',
      createdAt: '2026-07-29T16:57:40.000Z',
    });

    expect(result.kind).toBe('processable');
    if (result.kind !== 'processable') return;
    expect(result.event).toMatchObject({
      transactionId: 'charge-123',
      status: 'paid',
      amountMinor: 2518,
      currency: 'USD',
      trackingSrc: 'visitor-signed-token',
      buyer: { name: 'Maria', email: 'maria@example.com' },
      paymentMethod: 'credit_card',
      product: { id: 'product-123', name: 'Produto principal' },
      source: {
        src: 'visitor-signed-token',
        utm_source: 'facebook',
        utm_campaign: 'campanha-real',
      },
    });
  });

  it('aceita evento de carrinho no envelope atual da Vendepay', () => {
    const result = normalizeVendepay({
      event: 'carrinho.abandonado',
      checkoutId: 'checkout-456',
      checkout: {
        id: 'checkout-456',
        status: 'abandonado',
        moeda: 'BRL',
        total: '47.00',
        produtoId: 'product-456',
      },
      comprador: null,
      trackeamentoId: 'track-456',
    });

    expect(result.kind).toBe('processable');
    if (result.kind !== 'processable') return;
    expect(result.event).toMatchObject({
      transactionId: 'checkout-456',
      status: 'cancelled',
      amountMinor: 4700,
      currency: 'BRL',
      product: { id: 'product-456' },
    });
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
