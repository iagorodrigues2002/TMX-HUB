import type { MetricsView } from './offer-types.js';
import type { DashboardOfferEntry } from './offer-types.js';
import type { DashboardAccountSummary } from './offer-types.js';

export interface DashboardSummary {
  from: string;
  to: string;
  /** Null by design: a cross-account grand total is never produced. */
  totals: MetricsView | null;
  currencyTotals: Array<{ currency: string; totals: MetricsView }>;
  offers: DashboardOfferEntry[];
  accounts: DashboardAccountSummary[];
}

export interface IntradayWindowView {
  index: number;
  label: string;
  startHour: number;
  endHour: number;
  available: boolean;
  partial: boolean;
  samples: number;
  metrics: MetricsView;
  adsAvailable: boolean;
  adsPartial: boolean;
  ads: IntradayAdView[];
}

export interface IntradayAdView extends MetricsView {
  name: string;
}

export interface IntradaySummaryView {
  date: string;
  timeZone: string;
  updatedAt?: string;
  overall: MetricsView;
  overallAds: IntradayAdView[];
  currentWindowIndex: number;
  windows: IntradayWindowView[];
}

export interface IntradayRangeWindowView {
  index: number;
  label: string;
  startHour: number;
  endHour: number;
  available: boolean;
  partial: boolean;
  samples: number;
  daysAvailable: number;
  metrics: MetricsView;
  adsAvailable: boolean;
  adsPartial: boolean;
  ads: IntradayAdView[];
}

export interface IntradayRangeSummaryView {
  from: string;
  to: string;
  timeZone: string;
  updatedAt?: string;
  days: number;
  overall: MetricsView;
  overallAds: IntradayAdView[];
  windows: IntradayRangeWindowView[];
}

export type OfferAiTone = 'direto' | 'conservador' | 'detalhado';

export interface OfferAiConfigView {
  provider: 'opencode-go';
  model: string;
  role: string;
  template: string;
  responsible: string;
  minRoas: number;
  tone: OfferAiTone;
  includeAds: boolean;
  autoGenerate: boolean;
  scheduleHours: number[];
  apiKeyConfigured: boolean;
  apiKeyHint?: string;
}

export interface OfferAiAnalysisView {
  id: string;
  offerId: string;
  model: string;
  text: string;
  observation: string;
  metrics?: {
    spend: number;
    revenue: number;
    sales: number;
    ic: number;
    cpa: number | null;
    roas: number | null;
  };
  windows?: Array<{
    label: string;
    spend: number;
    revenue: number;
    sales: number;
    cpa: number | null;
    roas: number | null;
  }>;
  feedback?: string;
  createdAt: string;
}

export interface OfferAiConfigWire {
  provider: 'opencode-go';
  model: string;
  role: string;
  template: string;
  responsible: string;
  min_roas: number;
  tone: OfferAiTone;
  include_ads: boolean;
  auto_generate: boolean;
  schedule_hours: number[];
  api_key_configured: boolean;
  api_key_hint?: string;
}
