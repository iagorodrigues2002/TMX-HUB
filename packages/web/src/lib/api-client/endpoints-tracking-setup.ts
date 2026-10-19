import type { ExplodelyGatewaySettings } from '@page-cloner/shared';
import { request } from './request.js';
import type { SyzepayFees } from './tracking-overview-types.js';
export const endpoints = {
  async getTrackingConfig(id: string): Promise<{
    configured: boolean;
    project?: { id: string; public_key: string; enabled: boolean; install_code: string };
    vendepay?: {
      configured: boolean;
      enabled: boolean;
      propagation_param: string;
      signing_secret_configured: boolean;
      connections: Array<{
        id: string;
        name: string;
        enabled: boolean;
        propagation_param: string;
        signing_secret_configured: boolean;
        created_at: string;
      }>;
    };
    gateways?: Array<{
      id: string;
      provider: string;
      fee_settings?: Partial<SyzepayFees>;
      name: string;
      enabled: boolean;
      settings: {
        product_id?: string | null;
        currency?: string;
        environment?: 'sandbox' | 'production';
      };
      api_key_configured: boolean;
      signing_secret_configured: boolean;
      last_validated_at: string | null;
      last_webhook_at: string | null;
      created_at: string;
    }>;
  }> {
    return request(`/v1/offers/${id}/tracking`);
  },

  async createGatewayConnection(
    id: string,
    body:
      | {
          provider: 'paysight';
          name: string;
          api_key?: string;
          signing_secret?: string;
          product_id?: string;
          environment?: 'sandbox' | 'production';
        }
      | {
          provider: 'explodely';
          name: string;
          vendor_id: string;
          seller_id?: string;
          currency: ExplodelyGatewaySettings['currency'];
          amount_unit: 'minor' | 'decimal';
          amount_scale: number;
          environment?: 'sandbox' | 'production';
        },
  ): Promise<{
    connection: { id: string; provider: string; name: string };
    webhook_url: string;
    warning: string;
  }> {
    return request(`/v1/offers/${id}/tracking/gateway-connections`, { method: 'POST', body });
  },

  async setupTracking(id: string): Promise<{
    project_id: string;
    public_key: string;
    install_code: string;
    vendepay_webhook_url: string | null;
    warning: string;
    already_configured?: boolean;
  }> {
    return request(`/v1/offers/${id}/tracking/setup`, { method: 'POST' });
  },

  async rotateVendepayWebhook(id: string): Promise<{
    vendepay_webhook_url: string;
    warning: string;
  }> {
    return request(`/v1/offers/${id}/tracking/vendepay/rotate-token`, { method: 'POST' });
  },

  async createVendepayConnection(
    id: string,
    name: string,
  ): Promise<{
    connection: {
      id: string;
      name: string;
      enabled: boolean;
      propagation_param: string;
      signing_secret_configured: boolean;
      created_at: string;
    };
    vendepay_webhook_url: string;
    warning: string;
  }> {
    return request(`/v1/offers/${id}/tracking/vendepay/connections`, {
      method: 'POST',
      body: { name },
    });
  },

  async updateVendepayConnection(
    id: string,
    connectionId: string,
    body: { name?: string; enabled?: boolean },
  ): Promise<void> {
    await request(`/v1/offers/${id}/tracking/vendepay/connections/${connectionId}`, {
      method: 'PATCH',
      body,
    });
  },

  async rotateVendepayConnectionWebhook(
    id: string,
    connectionId: string,
  ): Promise<{ vendepay_webhook_url: string; warning: string }> {
    return request(`/v1/offers/${id}/tracking/vendepay/connections/${connectionId}/rotate-token`, {
      method: 'POST',
    });
  },

  async saveVendepayConnectionSigningSecret(
    id: string,
    connectionId: string,
    signingSecret: string,
  ): Promise<{ configured: boolean; updated_at: string }> {
    return request(
      `/v1/offers/${id}/tracking/vendepay/connections/${connectionId}/signing-secret`,
      { method: 'PUT', body: { signing_secret: signingSecret } },
    );
  },

  async saveVendepaySigningSecret(
    id: string,
    signingSecret: string,
  ): Promise<{ configured: boolean; updated_at: string }> {
    return request(`/v1/offers/${id}/tracking/vendepay/signing-secret`, {
      method: 'PUT',
      body: { signing_secret: signingSecret },
    });
  },

  async previewVendepayWebhook(
    id: string,
    payload: unknown,
  ): Promise<{
    processable: boolean;
    diagnostics?: string[];
    normalized?: {
      transactionId: string;
      status: string;
      trackingSrc?: string;
      amountMinor?: number;
      currency?: string;
      paymentMethod?: string;
      product: { id?: string; name?: string; planId?: string; planName?: string };
      source: Record<string, string>;
    };
  }> {
    return request(`/v1/offers/${id}/tracking/vendepay/preview`, {
      method: 'POST',
      body: payload,
    });
  },

  async listVendepayReceipts(
    id: string,
    connectionId?: string,
  ): Promise<{
    receipts: Array<{
      id: string;
      connection_id: string;
      connection_name: string;
      state: string;
      diagnostics?: string[];
      received_at: string;
      processed_at?: string;
      transaction_id?: string;
      order_status?: string;
      amount_minor?: string;
      currency?: string;
      payment_method?: string;
      product?: Record<string, string>;
    }>;
  }> {
    const query = connectionId ? `?connection_id=${encodeURIComponent(connectionId)}` : '';
    return request(`/v1/offers/${id}/tracking/vendepay/receipts${query}`);
  },

  async backfillTrackingReversals(id: string): Promise<{
    inspected: number;
    recognized: number;
    updated: number;
    missing_order: number;
  }> {
    return request(`/v1/offers/${id}/tracking/orders/backfill-reversals`, { method: 'POST' });
  },
};
