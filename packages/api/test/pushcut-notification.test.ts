import { describe, expect, it } from 'vitest';
import { buildPushcutNotificationPayload } from '../src/integrations/pushcut/notification.js';

describe('Pushcut sale notification', () => {
  it.each([
    ['front' as const, 'Venda aprovada · PJR_ENG'],
    ['upsell' as const, 'Upsell aprovado · PJR_ENG'],
  ])('includes the Vendepay account for %s orders', (kind, title) => {
    const payload = buildPushcutNotificationPayload(
      {
        kind,
        buyerName: 'Cliente',
        productName: 'Oferta',
        amountBrlMinor: 9990,
        currency: 'BRL',
        funnelName: 'PJR_ENG',
        platformName: 'Vendepay Iago',
      },
      [],
    );

    expect(payload.title).toBe(title);
    expect(payload.text).toBe('Vendepay Iago · Cliente · Oferta · R$ 99,90');
  });

  it('keeps a safe fallback for historical orders without an account name', () => {
    const payload = buildPushcutNotificationPayload(
      {
        kind: 'front',
        buyerName: 'Cliente',
        amountBrlMinor: 5000,
        currency: 'BRL',
      },
      [],
    );

    expect(payload.text).toBe('Cliente · R$ 50,00');
  });
});
