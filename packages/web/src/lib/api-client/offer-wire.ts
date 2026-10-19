import type { DashboardSummary } from './offer-analysis-types.js';
import type { OfferStatus } from './offer-types.js';
import type { AdsetView } from './offer-types.js';
import type { AdView } from './offer-types.js';
import type { MetricsView } from './offer-types.js';
import type { OfferView } from './offer-types.js';
import type { OfferSnapshotsView } from './offer-types.js';

export interface OfferWire {
  id: string;
  member_ids?: string[];
  can_manage?: boolean;
  can_configure_tracking?: boolean;
  name: string;
  company_name?: string;
  dashboard_id?: string;
  currency?: string;
  utmify_configured?: boolean;
  utmify_access_enabled?: boolean;
  utmify_login_hint?: string;
  sync_status?: 'idle' | 'syncing' | 'success' | 'partial' | 'error';
  last_sync_at?: string;
  last_sync_error?: string;
  description?: string;
  status?: OfferStatus;
  created_at: string;
  updated_at?: string;
}

export interface OfferSnapshotsWire {
  offer: OfferWire;
  from: string;
  to: string;
  snapshots: Array<{
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
    updated_at: string;
  }>;
  totals: MetricsView;
}

export interface DashboardSummaryWire {
  from: string;
  to: string;
  totals: MetricsView | null;
  currency_totals?: Array<{ currency: string; totals: MetricsView }>;
  offers: Array<{
    offer: OfferWire;
    totals: MetricsView;
    snapshots_count: number;
  }>;
  accounts?: Array<{
    owner_id: string;
    owner_name: string;
    is_current_user: boolean;
    totals: MetricsView;
    currency_totals?: Array<{ currency: string; totals: MetricsView }>;
    offers: Array<{
      offer: OfferWire;
      totals: MetricsView;
      snapshots_count: number;
    }>;
  }>;
}

export function fromOfferWire(w: OfferWire): OfferView {
  return {
    id: w.id,
    memberIds: w.member_ids ?? [],
    canManage: Boolean(w.can_manage),
    canConfigureTracking: Boolean(w.can_configure_tracking),
    name: w.name,
    companyName: w.company_name,
    dashboardId: w.dashboard_id,
    currency: w.currency ?? 'BRL',
    utmifyConfigured: Boolean(w.utmify_configured),
    utmifyAccessEnabled: w.utmify_access_enabled ?? Boolean(w.utmify_configured),
    utmifyLoginHint: w.utmify_login_hint,
    syncStatus: w.sync_status ?? 'idle',
    lastSyncAt: w.last_sync_at,
    lastSyncError: w.last_sync_error,
    description: w.description,
    status: w.status ?? 'testando',
    createdAt: w.created_at,
    updatedAt: w.updated_at,
  };
}

export function fromOfferSnapshotsWire(w: OfferSnapshotsWire): OfferSnapshotsView {
  return {
    offer: fromOfferWire(w.offer),
    from: w.from,
    to: w.to,
    snapshots: w.snapshots.map((s) => ({
      date: s.date,
      spend: s.spend,
      sales: s.sales,
      revenue: s.revenue,
      ic: s.ic,
      impressions: s.impressions,
      clicks: s.clicks,
      adsets: s.adsets,
      ads: s.ads,
      metrics: s.metrics,
      updatedAt: s.updated_at,
    })),
    totals: w.totals,
  };
}

export function fromDashboardSummaryWire(w: DashboardSummaryWire): DashboardSummary {
  return {
    from: w.from,
    to: w.to,
    totals: w.totals,
    currencyTotals: w.currency_totals ?? [],
    offers: (w.offers ?? []).map((e) => ({
      offer: fromOfferWire(e.offer),
      totals: e.totals,
      snapshotsCount: e.snapshots_count,
    })),
    accounts: (w.accounts ?? []).map((account) => ({
      ownerId: account.owner_id,
      ownerName: account.owner_name,
      isCurrentUser: account.is_current_user,
      totals: account.totals,
      currencyTotals: account.currency_totals ?? [],
      offers: account.offers.map((entry) => ({
        offer: fromOfferWire(entry.offer),
        totals: entry.totals,
        snapshotsCount: entry.snapshots_count,
      })),
    })),
  };
}
