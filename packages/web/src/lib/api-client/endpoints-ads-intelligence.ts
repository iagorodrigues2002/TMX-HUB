import type { AdsIntelligenceData } from './advertising-intelligence-types.js';
import { request } from './request.js';
export const endpoints = {
  getAdsIntelligence: () => request<AdsIntelligenceData>('/v1/ads-intelligence'),
  saveAdsIntelligenceConnection: (body: {
    login: string;
    password: string;
    dashboard_id: string;
  }) => request('/v1/ads-intelligence/connection', { method: 'PUT', body }),
  mapAdsIntelligenceCampaign: (body: { campaign_key: string; offer_id: string }) =>
    request('/v1/ads-intelligence/mappings', { method: 'PUT', body }),
};
