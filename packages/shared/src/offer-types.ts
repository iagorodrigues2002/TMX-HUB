// ---- Dashboard / Offers ----

/**
 * An "offer" is one product/funnel you're driving traffic to. Each offer
 * has its own daily snapshots aggregated from UTMify (or any source via
 * /v1/offers/:id/ingest). Rendered as a sub-dashboard.
 */
/** Stages we track per offer in the DR pipeline. */
export type OfferStatus = 'testando' | 'validando' | 'escala' | 'pausado' | 'morrendo';

export interface Offer {
  id: string;
  userId: string;
  /** Existing member accounts allowed to view this offer and its metrics. */
  memberIds?: string[];
  name: string; // ex. "PFL_ENG"
  companyName?: string;
  /** UTMify dashboardId, kept for reference + auto-config in n8n. */
  dashboardId?: string;
  /** ISO 4217 currency detected from the UTMify dashboard payload. */
  currency?: string;
  /** Whether server-side UTMify credentials are configured (credentials are never exposed). */
  utmifyConfigured?: boolean;
  utmifyAccessEnabled?: boolean;
  utmifyLoginHint?: string;
  syncStatus?: 'idle' | 'syncing' | 'success' | 'partial' | 'error';
  lastSyncAt?: string;
  lastSyncError?: string;
  description?: string;
  status: OfferStatus;
  createdAt: string;
  updatedAt?: string;
}

/**
 * Per-adset breakdown of a daily snapshot. Same metrics, scoped to one ad set.
 */
export interface AdsetSnapshot {
  name: string;
  spend: number;
  sales: number;
  revenue: number;
  ic: number;
  /** Optional traffic-side metrics. */
  impressions?: number;
  clicks?: number;
}

/** Per-ad breakdown returned by UTMify when querying with level=ad. */
export interface AdSnapshot extends AdsetSnapshot {
  hookRate?: number;
  ctr?: number;
}

/**
 * Aggregated metrics for one offer on one day. Idempotent on
 * (offerId, date) — re-ingesting overwrites.
 */
export interface DailySnapshot {
  offerId: string;
  date: string; // YYYY-MM-DD
  spend: number; // Dashboard currency
  sales: number; // count
  revenue: number; // Dashboard currency
  ic: number; // initiate checkout count
  impressions?: number;
  clicks?: number;
  adsets?: AdsetSnapshot[];
  ads?: AdSnapshot[];
  updatedAt: string;
}

/**
 * Computed metrics surface returned by /v1/offers/summary and /v1/offers/:id/snapshots.
 * Convenience for the UI so we don't recompute in three places.
 */
export interface SnapshotMetrics {
  spend: number;
  sales: number;
  revenue: number;
  ic: number;
  /** spend / sales (∞ when no sales) */
  cpa: number | null;
  /** spend / ic */
  icCpa: number | null;
  /** sales / ic (0..1) */
  conversionRate: number | null;
  /** revenue / spend */
  roas: number | null;
}

export interface CreateOfferRequest {
  utmify_access_enabled?: boolean;
  name: string;
  dashboard_id?: string;
  description?: string;
  status?: OfferStatus;
  utmify_login?: string;
  utmify_password?: string;
  member_ids?: string[];
}

export interface UpdateOfferRequest {
  name?: string;
  company_name?: string;
  dashboard_id?: string;
  description?: string;
  status?: OfferStatus;
  utmify_login?: string;
  utmify_password?: string;
  member_ids?: string[];
}
