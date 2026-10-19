export type AdsIntelligenceMetrics = {
  spend: number | null;
  impressions: number | null;
  clicks: number | null;
  video_views: number | null;
  ic: number;
  front_sales: number;
  upsell_sales: number;
  revenue: number;
  cpc: number | null;
  cpm: number | null;
  ctr: number | null;
  hook_rate: number | null;
  roas: number | null;
  roi: number | null;
  calculation_status?: 'complete' | 'provisional' | 'unavailable';
  calculation_reason?: string | null;
};

export type AdsIntelligenceData = {
  connection: null | {
    dashboard_id: string;
    state: string;
    last_sync_at: string | null;
    next_sync_at: string | null;
    error: string | null;
    cursor_date?: string;
    range_end?: string | null;
    coverage_complete?: boolean;
    retry_attempts?: number;
    account_failures?: Array<{
      platform: 'meta' | 'google' | 'tiktok';
      account_id: string;
      account_name: string;
      reason: string;
      from: string;
      to: string;
    }>;
    platform_coverage?: Array<{
      platform: 'meta' | 'google' | 'tiktok';
      state: 'complete' | 'partial' | 'unavailable';
      accounts: number;
    }>;
  };
  offers: Array<{ id: string; name: string; company_name?: string | null }>;
  pending: Array<{
    campaign_key: string;
    campaign_name: string;
    reason?: string;
    can_map_offer: boolean;
  }>;
  coverage?: { from: string | null; to: string | null; complete?: boolean };
  currency?: string;
  batches: Array<{
    key: string;
    name: string;
    offer_id: string;
    offer_name: string;
    ads: Array<
      AdsIntelligenceMetrics & {
        key: string;
        name: string;
        sources?: Array<{
          platform?: string;
          account_id?: string | null;
          account_name?: string | null;
          campaign_id?: string | null;
          campaign_name?: string | null;
          adset_id?: string | null;
          adset_name?: string | null;
          ad_id?: string | null;
          ad_name?: string | null;
          page_id?: string | null;
          page_name?: string | null;
        }>;
      }
    >;
    totals: AdsIntelligenceMetrics;
  }>;
};
