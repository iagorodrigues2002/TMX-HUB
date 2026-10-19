export type UpsellStageKey = `upsell_${number}`;

export type TrackingProductKind = 'front' | 'upsell' | `upsell_${number}`;

export type VturbPlayer = {
  id: string;
  name: string;
  pitch_time: number;
  duration: number;
  created_at?: string;
};

export type VturbComparisonGroup = {
  id: string;
  name: string;
  player_ids: string[];
  players: Array<{
    player_id: string;
    traffic_percentage: number;
    started_at: string | null;
    locked: boolean;
  }>;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
};

export type VturbCountryMetric = {
  grouped_field: string;
  total_viewed_device_uniq: number;
  total_started_device_uniq: number;
  total_clicked_device_uniq: number;
  engagement_rate: number;
  total_over_pitch: number;
  over_pitch_rate: number;
  total_conversions: number;
  overall_conversion_rate: number;
  total_amount_brl: number;
  total_amount_usd: number;
  play_rate: number;
};

export type VturbAnalytics = {
  player: VturbPlayer;
  period: { from: string; to: string };
  overall: Record<string, number>;
  countries: VturbCountryMetric[];
  engagement: {
    average_watched_time?: number;
    engagement_rate?: number;
    grouped_timed?: Array<{ timed: number; total_users: number }>;
  };
  clicks: Array<{ timed: number; total_users: number }>;
  conversions: Record<string, unknown>;
  tmx_country_conversions?: Array<{
    country: string;
    total_conversions: number;
    total_amount_brl: number;
  }>;
};

export type VturbComparisonAnalytics = {
  kind: 'comparison_group';
  comparison_group: VturbComparisonGroup;
  period: { from: string; to: string };
  stats: {
    stats?: Array<{
      player_id: string;
      pitch_time?: number;
      video_duration?: number;
      views?: { total_uniq_device?: number };
      plays?: { total_uniq_device?: number };
      conversions?: {
        total?: number;
        total_amount_brl?: number;
        total_amount_usd?: number;
        total_amount_eur?: number;
      };
      pitch_retention_rate?: number;
      play_rate?: number;
      conversion_rate?: number;
      rpv_brl?: number;
      rpv_usd?: number;
      rpv_eur?: number;
    }>;
  };
};

export type TrackingOrderKind = TrackingProductKind | 'unknown';
