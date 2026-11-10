import { describe, expect, it } from 'vitest';
import { buildPushcutNotificationPayload } from '../src/integrations/pushcut/notification.js';
import {
  PushcutProfileSchema,
  isPushcutUpsell,
  pushcutOrderSelected,
} from '../src/integrations/pushcut/policy.js';

describe('Pushcut sale notification', () => {
  it('hides the amount entirely when the recipient opts out', () => {
    const payload = buildPushcutNotificationPayload(
      { kind: 'upsell', amountBrlMinor: 9990, currency: 'BRL', showAmount: false },
      [],
    );
    expect(payload.text).toBe('Cliente');
    expect(JSON.stringify(payload)).not.toContain('99');
  });

  it('selects exact stages without treating unclassified sales as front', () => {
    expect(pushcutOrderSelected('front', ['upsell_4'])).toBe(false);
    expect(pushcutOrderSelected('upsell_4', ['upsell_4'])).toBe(true);
    expect(pushcutOrderSelected('upsell_5', ['upsell_4'])).toBe(false);
    expect(pushcutOrderSelected('unknown', ['front'])).toBe(false);
    expect(pushcutOrderSelected('upsell_5', null)).toBe(true);
    expect(isPushcutUpsell('upsell_10')).toBe(true);
    expect(isPushcutUpsell('front')).toBe(false);
  });

  it('rejects invalid stages, duplicate offers and upsells without a notification', () => {
    const profile = {
      name: 'Iago',
      front_notification_name: 'Front',
      upsell_notification_name: 'Upsell',
      devices: [],
      offer_ids: ['one'],
      order_kinds: ['front', 'upsell_4'],
      show_amount: false,
      enabled: true,
    };
    expect(PushcutProfileSchema.safeParse(profile).success).toBe(true);
    expect(PushcutProfileSchema.safeParse({ ...profile, order_kinds: ['unknown'] }).success).toBe(
      false,
    );
    expect(PushcutProfileSchema.safeParse({ ...profile, offer_ids: ['one', 'one'] }).success).toBe(
      false,
    );
    expect(
      PushcutProfileSchema.safeParse({ ...profile, upsell_notification_name: null }).success,
    ).toBe(false);
  });
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
        platformName: 'VendePay Mainex',
      },
      [],
    );

    expect(payload.title).toBe(title);
    expect(payload.text).toBe('VendePay Mainex · Cliente · Oferta · R$ 99,90');
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
