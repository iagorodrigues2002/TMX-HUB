import { request } from './request.js';
import type { TrackingPeriod } from './response-types.js';
import { trackingPeriodParams } from './response-types.js';
export const endpoints = {
  async listMetaDeliveries(id: string): Promise<{
    deliveries: Array<{
      id: string;
      event_id: string;
      state: 'pending' | 'processing' | 'delivered' | 'failed';
      attempts: number;
      last_error?: string;
      response_status?: number;
      provider_event_count: number;
      created_at: string;
      delivered_at?: string;
      pixel_name: string;
      pixel_id: string;
      product_ids?: string[];
      transaction_id: string;
      event_name: 'PageView' | 'InitiateCheckout' | 'Purchase';
      event_url?: string;
      campaign_id?: string;
      adset_id?: string;
      ad_id?: string;
      has_fbclid: boolean;
      has_fbc: boolean;
      has_fbp: boolean;
    }>;
  }> {
    return request(`/v1/offers/${id}/tracking/meta-deliveries`);
  },

  async setMetaPixelProducts(
    id: string,
    pixelId: string,
    productIds: string[],
  ): Promise<{ product_ids: string[] }> {
    return request(`/v1/offers/${id}/tracking/meta-pixels/${pixelId}/products`, {
      method: 'PUT',
      body: { product_ids: productIds },
    });
  },

  async reconcileInitiateCheckouts(
    id: string,
    period: string | TrackingPeriod,
  ): Promise<{
    date: string;
    attribution_recovered: number;
    events_found: number;
    pixels_enabled: number;
    utmify_destinations_enabled: number;
    meta_queued: number;
    utmify_queued: number;
  }> {
    const params = trackingPeriodParams(period);
    return request(`/v1/offers/${id}/tracking/initiate-checkout/reconcile?${params.toString()}`, {
      method: 'POST',
    });
  },

  async reconcileMetaPurchases(
    id: string,
  ): Promise<{ orders_found: number; pixels_enabled: number; purchases_queued: number }> {
    return request(`/v1/offers/${id}/tracking/meta-purchases/reconcile`, { method: 'POST' });
  },

  async replayMetaEvents(id: string): Promise<{
    pixels_enabled: number;
    pageviews_queued: number;
    initiate_checkouts_queued: number;
    front_purchases_queued: number;
    total_queued: number;
  }> {
    return request(`/v1/offers/${id}/tracking/meta-events/replay`, { method: 'POST' });
  },

  async listMetaPixels(id: string): Promise<{
    pixels: Array<{
      id: string;
      name: string;
      pixel_id: string;
      test_event_code?: string;
      enabled: boolean;
      product_ids?: string[];
    }>;
  }> {
    return request(`/v1/offers/${id}/tracking/meta-pixels`);
  },

  async saveMetaPixel(
    id: string,
    input: { name: string; pixel_id: string; access_token: string; test_event_code?: string },
  ): Promise<{
    verification: 'verified' | 'pending_event_test';
    verification_warning?: string;
    backfill_queued: number;
  }> {
    return request(`/v1/offers/${id}/tracking/meta-pixels`, { method: 'POST', body: input });
  },

  async updateMetaPixel(
    id: string,
    pixelId: string,
    input: {
      name: string;
      pixel_id: string;
      access_token?: string;
      test_event_code?: string | null;
    },
  ): Promise<void> {
    await request(`/v1/offers/${id}/tracking/meta-pixels/${pixelId}`, {
      method: 'PATCH',
      body: input,
    });
  },

  async sendMetaTestEvent(
    id: string,
    pixelId: string,
    eventName: 'InitiateCheckout' | 'Purchase',
  ): Promise<{
    accepted: boolean;
    event_name: string;
    event_id: string;
    events_received: number;
    detail: string;
  }> {
    return request(`/v1/offers/${id}/tracking/meta-pixels/${pixelId}/test-event`, {
      method: 'POST',
      body: { event_name: eventName },
    });
  },

  async updateMetaTestEventCode(id: string, pixelId: string, testEventCode: string): Promise<void> {
    await request(`/v1/offers/${id}/tracking/meta-pixels/${pixelId}/test-event-code`, {
      method: 'PATCH',
      body: { test_event_code: testEventCode },
    });
  },
};
