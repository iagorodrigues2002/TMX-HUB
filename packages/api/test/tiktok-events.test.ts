import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { buildTikTokPixelScript } from '../src/services/tracker-script.js';
import { TIKTOK_EVENTS_API_URL, buildTikTokPayload } from '../src/workers/tiktok.worker.js';

describe('TikTok Events API payload', () => {
  it('registers both browser pixels in the SDK and preserves an existing loader', () => {
    const inserted: unknown[] = [];
    const window: any = {};
    const document = {
      createElement: () => ({}),
      getElementsByTagName: () => [{ parentNode: { insertBefore: (s: unknown) => inserted.push(s) } }],
      addEventListener: () => {},
    };
    runInNewContext(buildTikTokPixelScript(['FIRST', 'SECOND']), { window, document });
    expect(Object.keys(window.ttq._i ?? {})).toEqual(['FIRST', 'SECOND']);
    expect(window.ttq._i.FIRST).toContainEqual(['page']);
    expect(window.ttq._i.SECOND).toContainEqual(['page']);
    const loader = window.ttq.load;
    runInNewContext(buildTikTokPixelScript(['FIRST', 'SECOND']), { window, document });
    expect(window.ttq.load).toBe(loader);
    expect(inserted).toHaveLength(2);
    expect(window.ttq._i.FIRST.filter((v: unknown[]) => v[0] === 'page')).toHaveLength(1);
  });
  it('uses a stable event id, hashes PII and keeps the TikTok click id', () => {
    const payload = buildTikTokPayload({
      pixelCode: 'C123ABC',
      eventId: 'vendepay:purchase:123',
      eventName: 'Purchase',
      occurredAt: new Date('2026-09-28T12:00:00.000Z'),
      eventUrl: 'https://theminex.com/checkout?ttclid=abc',
      referrer: 'https://www.tiktok.com/',
      value: 99.9,
      currency: 'USD',
      orderId: 'order-1',
      ttclid: 'abc',
      email: ' Buyer@Example.com ',
      phone: '+1 (305) 555-0100',
      externalId: 'visitor-1',
      contentId: 'front-1',
      contentName: 'Front',
      testEventCode: 'TEST-123',
    });
    expect(TIKTOK_EVENTS_API_URL).toBe(
      'https://business-api.tiktok.com/open_api/v1.3/event/track/',
    );
    expect(payload.event_source).toBe('web');
    expect(payload.event_source_id).toBe('C123ABC');
    expect(payload.test_event_code).toBe('TEST-123');
    expect(payload.data).toHaveLength(1);
    const event = payload.data[0]!;
    expect(event.event_id).toBe('vendepay:purchase:123');
    expect(event.event_time).toBe(1_790_596_800);
    expect(event.user.ttclid).toBe('abc');
    expect(event.page.referrer).toBe('https://www.tiktok.com/');
    expect(event.user.email).toBe(createHash('sha256').update('buyer@example.com').digest('hex'));
    expect(event.properties).toMatchObject({ value: 99.9, currency: 'USD', order_id: 'order-1' });
    expect(event.properties).not.toHaveProperty('test_event_code');
  });

  it('loads the browser Pixel only when a TikTok destination is active', () => {
    expect(buildTikTokPixelScript()).toBe('');
    const script = buildTikTokPixelScript(['C123ABC', 'C123ABC']);
    expect(script).toContain('analytics.tiktok.com/i18n/pixel/events.js');
    expect(script).toContain("q.instance(p).track('InitiateCheckout'");
    expect(script.match(/C123ABC/g)).toHaveLength(1);
  });
});
