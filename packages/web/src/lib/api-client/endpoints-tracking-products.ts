import { request } from './request.js';
import type { TrackingProductKind } from './tracking-types.js';
export const endpoints = {
  async getTrackingProductKinds(id: string): Promise<{
    configured: boolean;
    mapped: Array<{
      id: string;
      product_id: string;
      kind: TrackingProductKind;
      label: string | null;
      created_at: string;
      updated_at: string;
    }>;
    unmapped: Array<{
      product_id: string;
      product_name: string | null;
      orders: number;
      last_seen_at: string;
    }>;
  }> {
    return request(`/v1/offers/${id}/tracking/product-kinds`);
  },

  async setTrackingProductKind(
    id: string,
    body: {
      product_id: string;
      kind: TrackingProductKind;
      label?: string | null;
    },
  ): Promise<{
    id: string;
    product_id: string;
    kind: string;
    label: string | null;
    orders_updated: number;
  }> {
    return request(`/v1/offers/${id}/tracking/product-kinds`, {
      method: 'PUT',
      body,
    });
  },

  async deleteTrackingProductKind(id: string, productId: string): Promise<void> {
    await request(`/v1/offers/${id}/tracking/product-kinds/${encodeURIComponent(productId)}`, {
      method: 'DELETE',
    });
  },
};
