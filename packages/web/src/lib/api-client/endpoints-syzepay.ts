import { request } from './request.js';
import type { SyzepayFees } from './tracking-overview-types.js';
export const endpoints = {
  syzeSigningSecret: (id: string, signing_secret: string) =>
    request(`/v1/tracking/syzepay/connections/${id}/signing-secret`, {
      method: 'PUT',
      body: { signing_secret },
    }),
  syzeOrders: (id: string) =>
    request<{
      signing_secret_configured: boolean;
      offers: Array<{ id: string; name: string }>;
      orders: Array<{
        order_id: string;
        store_id: string;
        amount_minor: number;
        currency: string;
        types: string[];
        signature_valid: boolean;
        status: string;
        hint_offer_id: string | null;
        tracking_order_id: string | null;
        mapping: null | { offer_id: string; order_kind: string };
      }>;
    }>(`/v1/tracking/syzepay/connections/${id}/orders`),
  syzeClassify: (id: string, orderId: string, offer_id: string, order_kind: string) =>
    request<{
      order_id: string;
      duplicate: boolean;
      meta: string[];
      utmify: string[];
      tiktok: string[];
      pushcut: string[];
    }>(`/v1/tracking/syzepay/connections/${id}/orders/${encodeURIComponent(orderId)}/classify`, {
      method: 'POST',
      body: { offer_id, order_kind },
    }),
  saveGatewayFees: (offerId: string, id: string, fees: SyzepayFees) =>
    request(`/v1/offers/${offerId}/tracking/gateway-connections/${id}/fees`, {
      method: 'PUT',
      body: fees,
    }),
  syzeSaveFees: (id: string, fees: SyzepayFees) =>
    request(`/v1/tracking/syzepay/connections/${encodeURIComponent(id)}/fees`, {
      method: 'PUT',
      body: fees,
    }),
  syzeToggle: (id: string, enabled: boolean) =>
    request(`/v1/tracking/syzepay/connections/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: { enabled },
    }),
  checkSyzepayUpsell: (offerId: string, orderId: string, stageId: string) =>
    request<{ compatible: boolean; reason: string; url?: string }>(
      `/v1/offers/${offerId}/tracking/upsell-identities/${orderId}/stages/${stageId}/syzepay-check`,
    ),
  syzeCompanies: () =>
    request<{ companies: Array<{ key: string; name: string; offers: number }> }>(
      '/v1/tracking/syzepay/companies',
    ),
  syzeConnections: () =>
    request<{
      connections: Array<{
        id: string;
        company_key: string;
        company_name: string;
        fee_settings: Partial<SyzepayFees>;
        fees_updated_at: string | null;
        name: string;
        enabled: boolean;
        receipts: number;
        last_received_at: string | null;
      }>;
    }>('/v1/tracking/syzepay/connections'),
  syzeCreate: (company_key: string, name: string) =>
    request<{ id: string; webhook_url: string }>('/v1/tracking/syzepay/connections', {
      method: 'POST',
      body: { company_key, name },
    }),
  syzeUrl: (id: string) =>
    request<{ webhook_url: string }>(
      `/v1/tracking/syzepay/connections/${encodeURIComponent(id)}/url`,
    ),
  syzeReceipts: (id: string) =>
    request<{
      receipts: Array<{
        id: string;
        received_at: string;
        attempts: number;
        content_type: string;
        body_bytes: number;
        state: string;
      }>;
    }>(`/v1/tracking/syzepay/connections/${encodeURIComponent(id)}/receipts`),
};
