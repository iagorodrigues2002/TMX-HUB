import { describe, expect, it } from 'vitest';
import { buildUtmifyOrderPayload } from '../src/integrations/utmify/sales.js';
import { createTrackingToken, readTrackingToken } from '../src/lib/tracking-token.js';
import { buildTrackerScript } from '../src/services/tracker-script.js';

describe('reliable tracking foundation', () => {
  it('signs and verifies an opaque cross-domain tracking token', () => {
    const secret = 'a-secret-long-enough-for-the-test';
    const token = createTrackingToken(
      { projectId: 'project-1', visitorId: 'visitor-1', journeyId: 'journey-1' },
      secret,
    );
    expect(readTrackingToken(token, secret)).toMatchObject({
      projectId: 'project-1',
      visitorId: 'visitor-1',
      journeyId: 'journey-1',
    });
    expect(readTrackingToken(`${token}x`, secret)).toBeNull();
  });

  it('generates a tracker with first-touch persistence and public custom events', () => {
    const script = buildTrackerScript('public-key-123456', ['123456789']);
    expect(() => new Function(script)).not.toThrow();
    expect(script).toContain('window.tmx.track');
    expect(script).toContain('_tmx_first');
    expect(script).toContain('InitiateCheckout');
    expect(script).toContain('/track/bootstrap');
    expect(script).toContain('/track/ab/assign');
    expect(script).toContain('ab_variant_id');
    expect(script).toContain("ab?.kind==='checkout'");
    expect(script).toContain('connect.facebook.net');
    expect(script).toContain('123456789');
    expect(script).toContain('campaign_id');
    expect(script).toContain('adset_id');
    expect(script).toContain('ad_id');
    expect(script).toContain('_fbclid_ts');
    expect(script).toContain("fb.1.'+ts+'.'+out.fbclid");
    expect(script).toContain('MutationObserver');
    expect(script).toContain('pushState');
    expect(script).toContain('isCheckout=a=>isRedirect(a)||');
    expect(script).toContain("if(!redirect)send('InitiateCheckout'");
  });

  it('maps a paid order to the UTMify sales contract', () => {
    const payload = buildUtmifyOrderPayload({
      orderId: 'order-1',
      provider: 'vendepay',
      status: 'paid',
      amountMinor: 19700,
      currency: 'BRL',
      createdAt: new Date('2026-07-27T10:00:00.000Z'),
      paidAt: new Date('2026-07-27T10:01:00.000Z'),
      buyer: {
        name: 'Maria',
        email: 'maria@example.com',
        phone: '5511999999999',
        country: 'us',
      },
      source: {
        utm_source: 'facebook',
        utm_campaign: 'campanha-a',
        utm_content: 'criativo-3',
      },
    });
    expect(payload.status).toBe('paid');
    expect(payload.commission.totalPriceInCents).toBe(19700);
    expect(payload.customer.country).toBe('US');
    expect(payload.trackingParameters).toMatchObject({
      utm_source: 'facebook',
      utm_campaign: 'campanha-a',
      utm_content: 'criativo-3',
    });
  });

  it('marks a pending checkout test without turning it into an approved sale', () => {
    const payload = buildUtmifyOrderPayload({
      isTest: true,
      orderId: 'TMX-TEST-IC-1',
      provider: 'tmx-test',
      status: 'pending',
      amountMinor: 100,
      currency: 'BRL',
      createdAt: new Date('2026-07-28T14:00:00.000Z'),
      buyer: { name: 'Cliente Teste', email: 'teste@theminex.com' },
      source: {
        utm_source: 'tmx',
        utm_medium: 'integration_test',
        utm_campaign: 'utmify_checkout_test',
        utm_content: 'initiate_checkout',
      },
    });

    expect(payload.isTest).toBe(true);
    expect(payload.status).toBe('waiting_payment');
    expect(payload.approvedDate).toBeNull();
    expect(payload.customer.country).toBe('BR');
    expect(payload.trackingParameters.utm_content).toBe('initiate_checkout');
  });
});
