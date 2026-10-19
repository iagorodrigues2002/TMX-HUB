import { request } from './request.js';
import type { TrackingPeriod } from './response-types.js';
import { trackingPeriodParams } from './response-types.js';
export const endpoints = {
  async createTrackingAbTest(
    id: string,
    body: {
      name: string;
      kind: 'checkout' | 'presell';
      traffic_a: number;
      variants: Array<{ label: string; gateway?: string; destination_url?: string }>;
    },
  ): Promise<void> {
    await request(`/v1/offers/${id}/tracking/ab-tests`, { method: 'POST', body });
  },

  async createTrackingEntryLink(
    id: string,
    body: {
      name: string;
      destination_url: string;
      traffic_source: 'meta' | 'google' | 'tiktok' | 'native' | 'organic' | 'email' | 'other';
    },
  ): Promise<void> {
    await request(`/v1/offers/${id}/tracking/entry-links`, { method: 'POST', body });
  },

  async updateTrackingEntryLink(
    id: string,
    linkId: string,
    body: {
      name?: string;
      destination_url: string;
      traffic_source?:
        | 'meta'
        | 'google'
        | 'tiktok'
        | 'native'
        | 'organic'
        | 'email'
        | 'other'
        | 'unknown';
    },
  ): Promise<void> {
    await request(`/v1/offers/${id}/tracking/entry-links/${linkId}`, {
      method: 'PATCH',
      body,
    });
  },

  async convertTrackingEntryLinkToAbTest(
    id: string,
    linkId: string,
    body: {
      name: string;
      traffic_a: number;
      variants: Array<{ label: string; destination_url: string }>;
    },
  ): Promise<{ test_id: string; tracking_url: string }> {
    return request(`/v1/offers/${id}/tracking/entry-links/${linkId}/ab-test`, {
      method: 'POST',
      body,
    });
  },

  async deleteTrackingEntryLink(id: string, linkId: string): Promise<void> {
    await request(`/v1/offers/${id}/tracking/entry-links/${linkId}`, { method: 'DELETE' });
  },

  async deleteTrackingAbTest(id: string, testId: string): Promise<void> {
    await request(`/v1/offers/${id}/tracking/ab-tests/${testId}`, { method: 'DELETE' });
  },

  async getTrackingAbTestMetrics(
    id: string,
    testId: string,
    period?: string | TrackingPeriod,
  ): Promise<{
    variants: Array<{
      id: string;
      label: string;
      position: number;
      destination_url?: string;
      visitors: number;
      checkouts: number;
      orders: number;
      paid_orders: number;
      front_buyers: number;
      revenue_brl_minor: string;
    }>;
  }> {
    const params = trackingPeriodParams(period);
    const query = params.size ? `?${params.toString()}` : '';
    return request(`/v1/offers/${id}/tracking/ab-tests/${testId}/metrics${query}`);
  },

  async controlTrackingAbTest(
    id: string,
    testId: string,
    body:
      | { action: 'pause' | 'resume' }
      | { action: 'select_winner'; variant_id: string }
      | {
          action: 'update_config';
          name: string;
          traffic_a: number;
          variants: Array<{ id: string; label: string; destination_url: string }>;
        },
  ): Promise<void> {
    await request(`/v1/offers/${id}/tracking/ab-tests/${testId}`, {
      method: 'PATCH',
      body,
    });
  },
};
