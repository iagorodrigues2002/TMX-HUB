import type { GoogleAdsDestinationConnection } from './advertising-types.js';
import type { GoogleAdsOAuthConnection } from './advertising-types.js';
import type { GoogleAdsAccount } from './advertising-types.js';
import type { GoogleAdsValidation } from './advertising-types.js';
import type { GoogleAdsDraft } from './advertising-types.js';
import type { GoogleAdsDraftInput } from './advertising-types.js';
import { request } from './request.js';
export const endpoints = {
  googleAdsConnectionStatus: (offerId: string) =>
    request<{
      oauth_configured: boolean;
      connections: GoogleAdsDestinationConnection[];
      oauth_connections: GoogleAdsOAuthConnection[];
    }>(`/v1/offers/${offerId}/tracking/google-ads/connection-status`),
  googleAdsOAuthStart: (offerId: string, id: string) =>
    request<{ authorization_url: string; state: string }>(
      `/v1/offers/${offerId}/tracking/google-ads/destinations/${id}/oauth/start`,
      { method: 'POST' },
    ),
  googleAdsOAuthComplete: (offerId: string, id: string, input: { code: string; state: string }) =>
    request<{ connected: boolean }>(
      `/v1/offers/${offerId}/tracking/google-ads/destinations/${id}/oauth/complete`,
      { method: 'POST', body: input },
    ),
  googleAdsAccounts: (offerId: string, id: string) =>
    request<{ accounts: GoogleAdsAccount[] }>(
      `/v1/offers/${offerId}/tracking/google-ads/destinations/${id}/oauth/accounts`,
    ),
  googleAdsLookupAccount: (offerId: string, id: string, customerId: string) =>
    request<{ account: GoogleAdsAccount }>(
      `/v1/offers/${offerId}/tracking/google-ads/destinations/${id}/oauth/accounts/lookup?customer_id=${encodeURIComponent(customerId)}`,
    ),
  googleAdsValidate: (offerId: string, id: string) =>
    request<GoogleAdsValidation>(
      `/v1/offers/${offerId}/tracking/google-ads/destinations/${id}/oauth/test`,
      { method: 'POST' },
    ),
  googleAdsValidateSynthetic: (offerId: string, id: string) =>
    request<GoogleAdsValidation>(
      `/v1/offers/${offerId}/tracking/google-ads/destinations/${id}/oauth/test-synthetic`,
      { method: 'POST' },
    ),
  googleAdsDisconnect: (offerId: string, id: string) =>
    request<void>(`/v1/offers/${offerId}/tracking/google-ads/destinations/${id}/oauth`, {
      method: 'DELETE',
    }),
  googleAdsAttachConnection: (offerId: string, id: string, connectionId: string) =>
    request<{ attached: boolean }>(
      `/v1/offers/${offerId}/tracking/google-ads/destinations/${id}/oauth/attach`,
      { method: 'POST', body: { connection_id: connectionId } },
    ),
  googleAdsDestinations: (offerId: string) =>
    request<{ destinations: GoogleAdsDraft[]; delivery_enabled: false }>(
      `/v1/offers/${offerId}/tracking/google-ads/destinations`,
    ),
  saveGoogleAdsDestination: (offerId: string, input: GoogleAdsDraftInput, id?: string) =>
    request<{ destination: GoogleAdsDraft }>(
      `/v1/offers/${offerId}/tracking/google-ads/destinations${id ? `/${id}` : ''}`,
      { method: id ? 'PUT' : 'POST', body: input },
    ),
  archiveGoogleAdsDestination: (offerId: string, id: string) =>
    request<void>(`/v1/offers/${offerId}/tracking/google-ads/destinations/${id}`, {
      method: 'DELETE',
    }),
};
