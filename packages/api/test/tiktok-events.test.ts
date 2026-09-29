import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildTikTokPayload } from '../src/workers/tiktok.worker.js';
import { buildTikTokPixelScript } from '../src/services/tracker-script.js';

describe('TikTok Events API payload', () => {
  it('uses a stable event id, hashes PII and keeps the TikTok click id', () => {
    const payload = buildTikTokPayload({
      pixelCode: 'C123ABC', eventId: 'vendepay:purchase:123', eventName: 'Purchase', occurredAt: new Date('2026-09-28T12:00:00.000Z'),
      eventUrl: 'https://theminex.com/checkout?ttclid=abc', referrer: 'https://www.tiktok.com/', value: 99.9, currency: 'USD', orderId: 'order-1', ttclid: 'abc',
      email: ' Buyer@Example.com ', phone: '+1 (305) 555-0100', externalId: 'visitor-1', contentId: 'front-1', contentName: 'Front', testEventCode: 'TEST-123',
    });
    expect(payload.event_id).toBe('vendepay:purchase:123');
    expect(payload.event_source).toBe('PIXEL_EVENTS');
    expect(payload.timestamp).toBe('2026-09-28T12:00:00.000Z');
    expect(payload.test_event_code).toBe('TEST-123');
    expect((payload.context.ad as { callback: string }).callback).toBe('abc');
    expect((payload.context.page as { referrer: string }).referrer).toBe('https://www.tiktok.com/');
    expect((payload.context.user as { email: string }).email).toBe(createHash('sha256').update('buyer@example.com').digest('hex'));
    expect(payload.properties).toMatchObject({ value: 99.9, currency: 'USD', order_id: 'order-1' });
  });

  it('loads the browser Pixel only when a TikTok destination is active', () => {
    expect(buildTikTokPixelScript()).toBe('');
    const script = buildTikTokPixelScript(['C123ABC', 'C123ABC']);
    expect(script).toContain('analytics.tiktok.com/i18n/pixel/events.js');
    expect(script).toContain("q.track('InitiateCheckout'");
    expect(script.match(/C123ABC/g)).toHaveLength(1);
  });
});
