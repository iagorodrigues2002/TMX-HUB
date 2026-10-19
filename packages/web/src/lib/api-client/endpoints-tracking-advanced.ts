import { request } from './request.js';
import type { VturbPlayer } from './tracking-types.js';
import type { VturbComparisonGroup } from './tracking-types.js';
import type { VturbAnalytics } from './tracking-types.js';
import type { VturbComparisonAnalytics } from './tracking-types.js';
export const endpoints = {
  async getAdvancedTracking(id: string): Promise<{
    configured: boolean;
    public_key?: string;
    domains: Array<{
      id: string;
      hostname: string;
      kind: 'source' | 'tracking';
      dns_target?: string;
      dns_records?: Array<{ hostlabel: string; requiredValue: string }>;
      dns_verified_at?: string;
      enabled: boolean;
      status: string;
      last_error?: string;
    }>;
    gateways: Array<{
      id?: string;
      name?: string;
      provider: string;
      propagation_param: string;
      enabled: boolean;
      settings?: { product_id?: string | null; environment?: 'sandbox' | 'production' };
      last_webhook_at?: string | null;
      managed?: boolean;
    }>;
    meta_rules: { attributed_only: boolean; minimum_amount_minor: string | number };
    ab_tests: Array<{
      id: string;
      name: string;
      kind: 'checkout' | 'presell';
      status: string;
      traffic_a: number;
      redirect_url: string;
      winner_variant_id?: string;
      winner_locked_at?: string;
      deleted_at?: string;
      variants: Array<{
        id: string;
        label: string;
        gateway?: string;
        destination_url?: string;
        position: number;
      }>;
    }>;
    entry_links: Array<{
      id: string;
      name: string;
      slug: string;
      destination_url: string;
      traffic_source:
        | 'meta'
        | 'google'
        | 'tiktok'
        | 'native'
        | 'organic'
        | 'email'
        | 'other'
        | 'unknown';
      ab_test_id?: string;
      tracking_url: string;
      enabled: boolean;
      created_at: string;
      updated_at: string;
    }>;
    vturb: {
      enabled: boolean;
      endpoint_url?: string;
      player_id?: string;
      comparison_group_id?: string;
      conversion_param?: string;
      analytics_token_configured?: boolean;
      last_validated_at?: string;
      last_error?: string;
    };
    domain_setup: { record_type: 'CNAME'; target: string; note: string };
  }> {
    return request(`/v1/offers/${id}/tracking/advanced`);
  },

  async saveVturbIntegration(
    id: string,
    body: {
      enabled: boolean;
      analytics_api_token?: string;
      endpoint_url?: string;
      player_id?: string | null;
      comparison_group_id?: string | null;
      conversion_param: string;
    },
  ): Promise<{ ok: boolean; players: VturbPlayer[]; comparison_groups: VturbComparisonGroup[] }> {
    return request(`/v1/offers/${id}/tracking/vturb`, { method: 'PATCH', body });
  },

  async getVturbPlayers(id: string): Promise<{
    players: VturbPlayer[];
    comparison_groups: VturbComparisonGroup[];
    selected_player_id: string | null;
    selected_comparison_group_id: string | null;
  }> {
    return request(`/v1/offers/${id}/tracking/vturb/players`);
  },

  async getVturbAnalytics(
    id: string,
    period: { from: string; to: string },
    playerId?: string,
    comparisonGroupId?: string,
  ): Promise<VturbAnalytics | VturbComparisonAnalytics> {
    const params = new URLSearchParams({ from: period.from, to: period.to });
    if (playerId) params.set('player_id', playerId);
    if (comparisonGroupId) params.set('comparison_group_id', comparisonGroupId);
    return request(`/v1/offers/${id}/tracking/vturb/analytics?${params.toString()}`);
  },

  async addTrackingDomain(
    id: string,
    hostname: string,
    kind: 'source' | 'tracking' = 'source',
  ): Promise<void> {
    await request(`/v1/offers/${id}/tracking/domains`, {
      method: 'POST',
      body: { hostname, kind },
    });
  },

  async verifyTrackingDomain(
    id: string,
    domainId: string,
  ): Promise<{ status: string; detail: string }> {
    return request(`/v1/offers/${id}/tracking/domains/${domainId}/verify`, { method: 'POST' });
  },

  async removeTrackingDomain(id: string, domainId: string): Promise<void> {
    await request(`/v1/offers/${id}/tracking/domains/${domainId}`, { method: 'DELETE' });
  },

  async saveTrackingMetaRules(
    id: string,
    body: { attributed_only: boolean; minimum_amount_minor: number },
  ): Promise<void> {
    await request(`/v1/offers/${id}/tracking/meta-rules`, { method: 'PATCH', body });
  },

  async addTrackingGateway(
    id: string,
    body: { provider: 'vendepay' | 'cooud'; propagation_param: string },
  ): Promise<void> {
    await request(`/v1/offers/${id}/tracking/gateways`, { method: 'POST', body });
  },
};
