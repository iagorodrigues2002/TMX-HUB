import { request } from './request.js';
export const endpoints = {
  async getTrackingPushcutDestinations(id: string): Promise<{
    destinations: Array<{
      id: string;
      name: string;
      front_notification_name: string;
      upsell_notification_name: string | null;
      devices: string[];
      enabled: boolean;
      created_at: string;
      updated_at: string;
    }>;
  }> {
    return request(`/v1/offers/${id}/tracking/pushcut-destinations`);
  },

  async createTrackingPushcutDestination(
    id: string,
    body: {
      name: string;
      secret: string;
      front_notification_name: string;
      upsell_notification_name?: string | null;
      devices?: string[];
    },
  ): Promise<{ destination: { id: string; name: string } }> {
    return request(`/v1/offers/${id}/tracking/pushcut-destinations`, {
      method: 'POST',
      body,
    });
  },

  async setTrackingPushcutDestinationEnabled(
    id: string,
    destinationId: string,
    enabled: boolean,
  ): Promise<void> {
    await request(`/v1/offers/${id}/tracking/pushcut-destinations/${destinationId}`, {
      method: 'PATCH',
      body: { enabled },
    });
  },

  async deleteTrackingPushcutDestination(id: string, destinationId: string): Promise<void> {
    await request(`/v1/offers/${id}/tracking/pushcut-destinations/${destinationId}`, {
      method: 'DELETE',
    });
  },

  async testTrackingPushcutDestination(
    id: string,
    destinationId: string,
  ): Promise<{
    accepted: boolean;
    status: number | null;
    response?: { error?: string; [key: string]: unknown };
    error?: string;
  }> {
    return request(`/v1/offers/${id}/tracking/pushcut-destinations/${destinationId}/test`, {
      method: 'POST',
    });
  },

  async listTrackingPushcutDeliveries(id: string): Promise<{
    deliveries: Array<{
      id: string;
      event_id: string;
      event_type: string;
      state: string;
      attempts: number;
      response_status: number | null;
      last_error: string | null;
      created_at: string;
      delivered_at: string | null;
      destination_name: string | null;
      transaction_id: string;
      order_kind: string;
    }>;
  }> {
    return request(`/v1/offers/${id}/tracking/pushcut-deliveries`);
  },

  async retryTrackingPushcutDelivery(id: string, deliveryId: string): Promise<void> {
    await request(`/v1/offers/${id}/tracking/pushcut-deliveries/${deliveryId}/retry`, {
      method: 'POST',
    });
  },

  async resendTrackingPushcutHistory(
    id: string,
  ): Promise<{ orders_scanned: number; destinations: number; notifications_queued: number }> {
    return request(`/v1/offers/${id}/tracking/pushcut-destinations/resend-history`, {
      method: 'POST',
    });
  },

  async recomputeTrackingProductKinds(id: string): Promise<{ updated: number }> {
    return request(`/v1/offers/${id}/tracking/product-kinds/recompute`, { method: 'POST' });
  },
};
