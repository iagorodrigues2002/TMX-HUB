import type { TikTokDestination } from './advertising-types.js';
import type { TikTokDestinationInput } from './advertising-types.js';
import type { TikTokDelivery } from './advertising-types.js';
import { request } from './request.js';
export const endpoints = {
  tiktokDestinations: (offerId: string) =>
    request<{ destinations: TikTokDestination[] }>(
      `/v1/offers/${offerId}/tracking/tiktok/destinations`,
    ),
  saveTikTokDestination: (offerId: string, input: TikTokDestinationInput, id?: string) =>
    request<{ destination: TikTokDestination }>(
      `/v1/offers/${offerId}/tracking/tiktok/destinations${id ? `/${id}` : ''}`,
      { method: id ? 'PUT' : 'POST', body: input },
    ),
  deleteTikTokDestination: (offerId: string, id: string) =>
    request<void>(`/v1/offers/${offerId}/tracking/tiktok/destinations/${id}`, { method: 'DELETE' }),
  testTikTokDestination: (
    _offerId: string,
    id: string,
    input: { test_event_code?: string; event_url?: string; email?: string; phone?: string },
  ) =>
    request<{ delivery_id: string; status: string; detail: string }>(
      `/v1/tracking/destinations/tiktok/${id}/test`,
      { method: 'POST', body: input },
    ),
  tiktokDelivery: (offerId: string, id: string) =>
    request<{ delivery: TikTokDelivery }>(`/v1/offers/${offerId}/tracking/tiktok/deliveries/${id}`),
};
