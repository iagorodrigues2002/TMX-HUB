// ---- Offers / Dashboards ----

export type OfferStatus = 'testando' | 'validando' | 'escala' | 'pausado' | 'morrendo';

export interface OfferView {
  id: string;
  memberIds: string[];
  /** True only for the offer owner or an administrator. */
  canManage: boolean;
  /** Tracking configuration is allowed for the offer owner, admin, or an explicitly invited member. */
  canConfigureTracking: boolean;
  name: string;
  companyName?: string;
  dashboardId?: string;
  currency: string;
  utmifyConfigured: boolean;
  utmifyAccessEnabled?: boolean;
  utmifyLoginHint?: string;
  syncStatus: 'idle' | 'syncing' | 'success' | 'partial' | 'error';
  lastSyncAt?: string;
  lastSyncError?: string;
  description?: string;
  status: OfferStatus;
  createdAt: string;
  updatedAt?: string;
}

export interface MetricsView {
  spend: number;
  sales: number;
  revenue: number;
  ic: number;
  cpa: number | null;
  icCpa: number | null;
  conversionRate: number | null;
  roas: number | null;
}

export interface AdsetView {
  name: string;
  spend: number;
  sales: number;
  revenue: number;
  ic: number;
  impressions?: number;
  clicks?: number;
}

export interface AdView extends AdsetView {
  hookRate?: number;
  ctr?: number;
}

export interface DailySnapshotView {
  date: string;
  spend: number;
  sales: number;
  revenue: number;
  ic: number;
  impressions?: number;
  clicks?: number;
  adsets?: AdsetView[];
  ads?: AdView[];
  metrics: MetricsView;
  updatedAt: string;
}

export interface OfferSnapshotsView {
  offer: OfferView;
  from: string;
  to: string;
  snapshots: DailySnapshotView[];
  totals: MetricsView;
}

export interface DashboardOfferEntry {
  offer: OfferView;
  totals: MetricsView;
  snapshotsCount: number;
}

export interface DashboardAccountSummary {
  ownerId: string;
  ownerName: string;
  isCurrentUser: boolean;
  totals: MetricsView;
  currencyTotals: Array<{ currency: string; totals: MetricsView }>;
  offers: DashboardOfferEntry[];
}

export interface TrackingFeeSettings {
  vendepay_fee_pct: number;
  extra_fee_minor: number;
  extra_fee_currency: string;
  reserve_pct: number;
  reserve_days: number;
  payout_days: number;
  configured: boolean;
}

export interface TrackingHealthView {
  score: number;
  status: 'excellent' | 'good' | 'attention' | 'critical';
  components: Array<{ key: string; label: string; score: number; weight: number }>;
  alerts: Array<{
    id: string;
    alert_key: string;
    severity: 'info' | 'warning' | 'critical';
    title: string;
    detail: string;
    metric: string | null;
    current_value: string | null;
    threshold_value: string | null;
    state: 'active' | 'acknowledged' | 'resolved';
    first_seen_at: string;
    last_seen_at: string;
    acknowledged_at: string | null;
    resolved_at: string | null;
  }>;
  metrics: {
    attribution_rate: number;
    meta_success: number;
    utmify_success: number;
    webhook_success: number;
    order_match: number;
    events_24h: number;
    last_event_at: string | null;
  };
}
