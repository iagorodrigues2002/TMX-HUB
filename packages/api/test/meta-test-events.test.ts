import { describe, expect, it } from 'vitest';
import { buildMetaTestEvent } from '../src/services/meta-test-events.js';

describe('Meta test events', () => {
  it('builds a valid InitiateCheckout server event', () => {
    const event = buildMetaTestEvent({
      eventName: 'InitiateCheckout',
      eventId: 'event-1',
      eventSourceUrl: 'https://theminex.com/tracking',
      externalId: 'user-1',
      now: new Date('2026-07-28T12:00:00.000Z'),
    });
    expect(event).toMatchObject({
      event_name: 'InitiateCheckout',
      event_time: 1785240000,
      event_id: 'event-1',
      action_source: 'website',
      custom_data: { value: 1, currency: 'BRL' },
    });
    expect(event.user_data.external_id[0]).toMatch(/^[a-f0-9]{64}$/);
  });

  it('adds the required purchase value, currency and unique order id', () => {
    const event = buildMetaTestEvent({
      eventName: 'Purchase',
      eventId: 'event-2',
      eventSourceUrl: 'https://theminex.com/tracking',
      externalId: 'user-1',
    });
    expect(event.custom_data).toMatchObject({
      value: 1,
      currency: 'BRL',
      order_id: 'tmx-test-event-2',
    });
  });
});
