import { describe, expect, it } from 'vitest';
import {
  buildUtmifyWebEventPayload,
  isUtmifyWebEventAccepted,
} from '../src/integrations/utmify/web-events.js';

describe('UTMify web events', () => {
  it('maps a TMX checkout click to the native UTMify IC contract', () => {
    const payload = buildUtmifyWebEventPayload({
      eventName: 'InitiateCheckout',
      pixelId: '1668989170852623',
      eventUrl: 'https://theminex.com/v1/r/test?ignored=1',
      pageTitle: 'SLM',
      clientIp: '198.51.100.20',
      userAgent: 'TMX test',
      source: {
        utm_source: 'facebook',
        utm_campaign: 'SLM_ESP',
        utm_content: 'SLM_ESP_AD251_H1',
        campaign_id: '120250707424500457',
        ad_id: '120250707424480457',
        fbclid: 'click-id',
        _fbc: 'fb.1.123.click-id',
        country: 'BR',
      },
    });

    expect(payload.type).toBe('InitiateCheckout');
    expect(payload.lead).toMatchObject({
      pixelId: '1668989170852623',
      ip: '198.51.100.20',
      fbc: 'fb.1.123.click-id',
    });
    expect(payload.lead.parameters).toContain('utm_campaign=SLM_ESP');
    expect(payload.lead.parameters).toContain('ad_id=120250707424480457');
    expect(payload.event).toEqual({
      sourceUrl: 'https://theminex.com/v1/r/test',
      pageTitle: 'SLM',
    });
  });

  it('does not mark an HTTP 200 response as delivered when UTMify rejected the pixel', () => {
    expect(
      isUtmifyWebEventAccepted({
        lead: {},
        event: {},
        message: 'pixel not found',
      }),
    ).toBe(false);
    expect(
      isUtmifyWebEventAccepted({
        lead: { _id: 'utmify-lead-id' },
        event: { _id: 'utmify-event-id' },
      }),
    ).toBe(true);
  });
});
