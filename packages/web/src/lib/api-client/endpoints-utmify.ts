import { request } from './request.js';
import type { TrackingPeriod } from './response-types.js';
import { trackingPeriodParams } from './response-types.js';
export const endpoints = {
  async getTrackingUtmifyDestination(id: string): Promise<{
    configured: boolean;
    destination?: {
      id: string;
      name: string;
      endpoint_url: string;
      enabled: boolean;
      updated_at: string;
    } | null;
  }> {
    return request(`/v1/offers/${id}/tracking/utmify-destination`);
  },

  async getTrackingUtmifyPixel(id: string): Promise<{
    configured: boolean;
    pixel_id: string | null;
  }> {
    return request(`/v1/offers/${id}/tracking/utmify-pixel`);
  },

  async saveTrackingUtmifyPixel(
    id: string,
    pixelId: string,
  ): Promise<{ configured: true; pixel_id: string }> {
    return request(`/v1/offers/${id}/tracking/utmify-pixel`, {
      method: 'PUT',
      body: { pixel_id: pixelId },
    });
  },

  async listTrackingUtmifyWebEvents(
    id: string,
    period: string | TrackingPeriod,
  ): Promise<{
    date: string;
    deliveries: Array<{
      id: string;
      event_id: string;
      pixel_id: string;
      state: 'pending' | 'processing' | 'delivered' | 'failed' | 'dead';
      attempts: number;
      response_status?: number;
      response?: Record<string, unknown> | null;
      last_error?: string;
      created_at: string;
      delivered_at?: string;
      campaign_id?: string;
      adset_id?: string;
      ad_id?: string;
      placement?: string;
      utmify_lead_id?: string;
      utmify_event_id?: string;
    }>;
  }> {
    const params = trackingPeriodParams(period);
    return request(`/v1/offers/${id}/tracking/utmify-web-events?${params.toString()}`);
  },

  async retryTrackingUtmifyWebEvent(id: string, deliveryId: string): Promise<void> {
    await request(`/v1/offers/${id}/tracking/utmify-web-events/${deliveryId}/retry`, {
      method: 'POST',
    });
  },

  async saveTrackingUtmifyDestination(
    id: string,
    input: { name: string; api_token: string; endpoint_url?: string },
  ): Promise<void> {
    await request(`/v1/offers/${id}/tracking/utmify-destination`, {
      method: 'PUT',
      body: input,
    });
  },

  async setTrackingUtmifyDestinationEnabled(
    id: string,
    enabled: boolean,
  ): Promise<{ destination: { id: string; enabled: boolean } }> {
    return request(`/v1/offers/${id}/tracking/utmify-destination`, {
      method: 'PATCH',
      body: { enabled },
    });
  },

  async listTrackingUtmifyDeliveries(id: string): Promise<{
    deliveries: Array<{
      id: string;
      event_id: string;
      event_type: string;
      state: 'pending' | 'processing' | 'delivered' | 'failed' | 'dead';
      attempts: number;
      response_status?: number;
      response?: Record<string, unknown> | null;
      last_error?: string;
      created_at: string;
      delivered_at?: string;
      transaction_id: string;
      order_status: string;
    }>;
  }> {
    return request(`/v1/offers/${id}/tracking/utmify-deliveries`);
  },

  async retryTrackingUtmifyDelivery(id: string, deliveryId: string): Promise<void> {
    await request(`/v1/offers/${id}/tracking/utmify-deliveries/${deliveryId}/retry`, {
      method: 'POST',
    });
  },

  async reconcileTrackingUtmifyUpsells(
    id: string,
  ): Promise<{ upsells_repaired: number; utmify_queued: number }> {
    return request(`/v1/offers/${id}/tracking/utmify-upsells/reconcile`, { method: 'POST' });
  },

  async reconcileTrackingUtmifyFront(
    id: string,
  ): Promise<{ front_orders_scanned: number; fully_attributed: number; utmify_queued: number }> {
    return request(`/v1/offers/${id}/tracking/utmify-front/reconcile`, { method: 'POST' });
  },

  async sendTrackingUtmifyTestCheckout(id: string): Promise<{
    accepted: boolean;
    delivery_id: string;
    transaction_id: string;
    status: 'waiting_payment';
    is_test: true;
  }> {
    return request(`/v1/offers/${id}/tracking/utmify-test-checkout`, {
      method: 'POST',
    });
  },
};
