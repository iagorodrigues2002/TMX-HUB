import type { TikTokDestinationInput as SharedTikTokDestinationInput } from '@page-cloner/shared';

export interface MetaControlConnection {
  id: string;
  name: string;
  app_id: string;
  token_type?: string | null;
  token_expires_at?: string | null;
  enabled: boolean;
  last_sync_at?: string | null;
  last_sync_error?: string | null;
}

export interface MetaControlAccount {
  id: string;
  external_id: string;
  name: string;
  business_id?: string | null;
  business_name?: string | null;
  account_status: number;
  disable_reason: number;
  currency: string;
  timezone_name?: string | null;
  amount_spent_minor: string;
  balance_minor: string;
  spend_cap_minor: string;
  primary_offer_id?: string | null;
  primary_offer_name?: string | null;
  last_synced_at: string;
  spend_30d_minor: string;
  impressions_30d: string;
  reach_30d: string;
  clicks_30d: string;
  link_clicks_30d: string;
  purchases_30d: string;
  purchase_value_30d: string;
  campaigns_total: number;
  campaigns_active: number;
  status_label: 'active' | 'disabled' | 'unsettled' | 'closed' | 'attention';
  operational_state: 'delivering' | 'idle' | 'disabled' | 'unsettled' | 'attention';
  health_score: number;
}

export interface MetaControlCampaign {
  id: string;
  account_id: string;
  external_id: string;
  name: string;
  configured_status?: string | null;
  effective_status?: string | null;
  objective?: string | null;
  offer_id?: string | null;
  daily_budget_minor?: string | null;
  lifetime_budget_minor?: string | null;
}

export interface MetaControlDashboard {
  accounts: MetaControlAccount[];
  campaigns: MetaControlCampaign[];
  offers: Array<{ id: string; name: string }>;
  synced_at?: string | null;
}

export interface MetaPaymentPushcutConfig {
  id: string;
  notification_name: string | null;
  devices: string[];
  enabled: boolean;
  secret_configured: boolean;
}

export interface UtmifyGlobalConfig {
  configured: boolean;
  destination: null | {
    id: string;
    name: string;
    endpoint_url: string;
    pixel_id: string | null;
    enabled: boolean;
    token_configured: boolean;
    created_at: string;
    updated_at: string;
  };
  stats: null | {
    orders_7d: number;
    orders_delivered_7d: number;
    orders_failed_7d: number;
    web_events_7d: number;
    web_events_delivered_7d: number;
  };
  offers: Array<{ id: string; name: string; company_name: string | null; enabled: boolean }>;
}

// ---- public methods ----

export type GoogleAdsDraftInput = {
  name: string;
  customer_id: string;
  conversion_action_id: string;
};

export type GoogleAdsDraft = GoogleAdsDraftInput & { id: string; mode: 'server'; state: 'draft' };

export type GoogleAdsOAuthConnection = { id: string; name: string; connected_at: string };

export type GoogleAdsDestinationConnection = {
  destination_id: string;
  connection_id: string;
  connection_name: string;
  connected_at: string;
};

export type GoogleAdsAccount = { customer_id: string; name: string; manager: boolean };

export type GoogleAdsValidation = {
  passed: boolean;
  validate_only: true;
  request_id: string | null;
  warnings: number;
  order_id: string | null;
  detail: string;
  synthetic?: boolean;
};

export type TikTokDestinationInput = SharedTikTokDestinationInput;

export type TikTokDestination = Omit<TikTokDestinationInput, 'access_token'> & {
  id: string;
  created_at: string;
  updated_at: string;
  deliveries_7d: number;
  delivered_7d: number;
  last_delivered_at: string | null;
};

export type TikTokDelivery = {
  id: string;
  state: 'pending' | 'processing' | 'delivered' | 'failed' | 'dead' | 'test';
  attempts: number;
  response_status: number | null;
  last_error: string | null;
  delivered_at: string | null;
  test_event_code: string | null;
  destination_name: string;
  pixel_code: string;
};
