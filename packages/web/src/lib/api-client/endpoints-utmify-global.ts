import type { UtmifyGlobalConfig } from './advertising-types.js';
import { request } from './request.js';
export const endpoints = {
  async getUtmifyGlobal(): Promise<UtmifyGlobalConfig> {
    return request('/v1/utmify-global');
  },

  async saveUtmifyGlobal(input: {
    name: string;
    api_token?: string;
    endpoint_url: string;
    pixel_id?: string | null;
    enabled: boolean;
  }): Promise<void> {
    await request('/v1/utmify-global', { method: 'PUT', body: input });
  },

  async testUtmifyGlobal(): Promise<{ transaction_id: string }> {
    return request('/v1/utmify-global/test', { method: 'POST' });
  },

  async replayUtmifyGlobal(): Promise<{
    orders_found: number;
    inserted: number;
    recovered: number;
    queued: number;
    queue_failed: number;
  }> {
    return request('/v1/utmify-global/replay', { method: 'POST' });
  },

  async saveUtmifyGlobalOffers(
    offerIds: string[],
  ): Promise<{ offers: UtmifyGlobalConfig['offers'] }> {
    return request('/v1/utmify-global/offers', { method: 'PUT', body: { offer_ids: offerIds } });
  },

  async assignMetaAccountOffer(accountId: string, offerId: string | null): Promise<void> {
    await request(`/v1/meta-control/accounts/${accountId}/offer`, {
      method: 'PATCH',
      body: { offer_id: offerId },
    });
  },

  async assignMetaCampaignOffer(campaignId: string, offerId: string | null): Promise<void> {
    await request(`/v1/meta-control/campaigns/${campaignId}/offer`, {
      method: 'PATCH',
      body: { offer_id: offerId },
    });
  },
};
