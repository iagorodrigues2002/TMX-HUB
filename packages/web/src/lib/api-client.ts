import { endpoints as adminEndpoints } from './api-client/endpoints-admin.js';
import { endpoints as adsIntelligenceEndpoints } from './api-client/endpoints-ads-intelligence.js';
import { endpoints as auditsEndpoints } from './api-client/endpoints-audits.js';
import { endpoints as authEndpoints } from './api-client/endpoints-auth.js';
import { endpoints as cloneLinksEndpoints } from './api-client/endpoints-clone-links.js';
import { endpoints as clonesEndpoints } from './api-client/endpoints-clones.js';
import { endpoints as dashboardEndpoints } from './api-client/endpoints-dashboard.js';
import { endpoints as googleAdsEndpoints } from './api-client/endpoints-google-ads.js';
import { endpoints as mediaEndpoints } from './api-client/endpoints-media.js';
import { endpoints as metaControlEndpoints } from './api-client/endpoints-meta-control.js';
import { endpoints as metaDeliveryEndpoints } from './api-client/endpoints-meta-delivery.js';
import { endpoints as nichesEndpoints } from './api-client/endpoints-niches.js';
import { endpoints as offerAiEndpoints } from './api-client/endpoints-offer-ai.js';
import { endpoints as offersEndpoints } from './api-client/endpoints-offers.js';
import { endpoints as pushcutEndpoints } from './api-client/endpoints-pushcut.js';
import { endpoints as recoveryEndpoints } from './api-client/endpoints-recovery.js';
import { endpoints as refundsEndpoints } from './api-client/endpoints-refunds.js';
import { endpoints as shieldEndpoints } from './api-client/endpoints-shield.js';
import { endpoints as syzepayEndpoints } from './api-client/endpoints-syzepay.js';
import { endpoints as tiktokEndpoints } from './api-client/endpoints-tiktok.js';
import { endpoints as trackingAdvancedEndpoints } from './api-client/endpoints-tracking-advanced.js';
import { endpoints as trackingEntryLinksEndpoints } from './api-client/endpoints-tracking-entry-links.js';
import { endpoints as trackingEventsEndpoints } from './api-client/endpoints-tracking-events.js';
import { endpoints as trackingFinanceEndpoints } from './api-client/endpoints-tracking-finance.js';
import { endpoints as trackingProductsEndpoints } from './api-client/endpoints-tracking-products.js';
import { endpoints as trackingSetupEndpoints } from './api-client/endpoints-tracking-setup.js';
import { endpoints as trackingUpsellAuditEndpoints } from './api-client/endpoints-tracking-upsell-audit.js';
import { endpoints as trackingUpsellsEndpoints } from './api-client/endpoints-tracking-upsells.js';
import { endpoints as usersEndpoints } from './api-client/endpoints-users.js';
import { endpoints as utmifyGlobalEndpoints } from './api-client/endpoints-utmify-global.js';
import { endpoints as utmifyEndpoints } from './api-client/endpoints-utmify.js';
export type { UpsellStageKey } from './api-client/tracking-types.js';
export type { TrackingProductKind } from './api-client/tracking-types.js';
export type { VturbPlayer } from './api-client/tracking-types.js';
export type { VturbComparisonGroup } from './api-client/tracking-types.js';
export type { VturbCountryMetric } from './api-client/tracking-types.js';
export type { VturbAnalytics } from './api-client/tracking-types.js';
export type { VturbComparisonAnalytics } from './api-client/tracking-types.js';
export type { TrackingOrderKind } from './api-client/tracking-types.js';
export type { TrackingOverviewTotals } from './api-client/tracking-overview-types.js';
export type { TrackingOverviewOffer } from './api-client/tracking-overview-types.js';
export type { TrackingOverviewAccount } from './api-client/tracking-overview-types.js';
export type { SyzepayFees } from './api-client/tracking-overview-types.js';
export type { ListResult } from './api-client/response-types.js';
export type { BulkLinkUpdateResult } from './api-client/response-types.js';
export type { TrackingPeriod } from './api-client/response-types.js';
export type { RefundBreakdown } from './api-client/response-types.js';
export type { RefundFinancialTotals } from './api-client/response-types.js';
export type { RefundRanking } from './api-client/response-types.js';
export { authToken } from './api-client/request.js';
export type { CloneJob } from './api-client/clone-wire.js';
export type { VslJobView } from './api-client/video-wire.js';
export type { FunnelJobView } from './api-client/video-wire.js';
export type { ToolKey } from './api-client/auth-types.js';
export type { AuthUser } from './api-client/auth-types.js';
export { canAccessTool } from './api-client/auth-types.js';
export { canAccessOfferAi } from './api-client/auth-types.js';
export type { InviteView } from './api-client/auth-types.js';
export type { OfferStatus } from './api-client/offer-types.js';
export type { OfferView } from './api-client/offer-types.js';
export type { MetricsView } from './api-client/offer-types.js';
export type { AdsetView } from './api-client/offer-types.js';
export type { AdView } from './api-client/offer-types.js';
export type { DailySnapshotView } from './api-client/offer-types.js';
export type { OfferSnapshotsView } from './api-client/offer-types.js';
export type { DashboardOfferEntry } from './api-client/offer-types.js';
export type { DashboardAccountSummary } from './api-client/offer-types.js';
export type { TrackingFeeSettings } from './api-client/offer-types.js';
export type { TrackingHealthView } from './api-client/offer-types.js';
export type { RecoveryView } from './api-client/recovery-types.js';
export type { DashboardSummary } from './api-client/offer-analysis-types.js';
export type { IntradayWindowView } from './api-client/offer-analysis-types.js';
export type { IntradayAdView } from './api-client/offer-analysis-types.js';
export type { IntradaySummaryView } from './api-client/offer-analysis-types.js';
export type { IntradayRangeWindowView } from './api-client/offer-analysis-types.js';
export type { IntradayRangeSummaryView } from './api-client/offer-analysis-types.js';
export type { OfferAiTone } from './api-client/offer-analysis-types.js';
export type { OfferAiConfigView } from './api-client/offer-analysis-types.js';
export type { OfferAiAnalysisView } from './api-client/offer-analysis-types.js';
export type { MetaControlConnection } from './api-client/advertising-types.js';
export type { MetaControlAccount } from './api-client/advertising-types.js';
export type { MetaControlCampaign } from './api-client/advertising-types.js';
export type { MetaControlDashboard } from './api-client/advertising-types.js';
export type { MetaPaymentPushcutConfig } from './api-client/advertising-types.js';
export type { UtmifyGlobalConfig } from './api-client/advertising-types.js';
export type { GoogleAdsDraftInput } from './api-client/advertising-types.js';
export type { GoogleAdsDraft } from './api-client/advertising-types.js';
export type { GoogleAdsOAuthConnection } from './api-client/advertising-types.js';
export type { GoogleAdsDestinationConnection } from './api-client/advertising-types.js';
export type { GoogleAdsAccount } from './api-client/advertising-types.js';
export type { GoogleAdsValidation } from './api-client/advertising-types.js';
export type { TikTokDestinationInput } from './api-client/advertising-types.js';
export type { TikTokDestination } from './api-client/advertising-types.js';
export type { TikTokDelivery } from './api-client/advertising-types.js';
export type { AdsIntelligenceMetrics } from './api-client/advertising-intelligence-types.js';
export type { AdsIntelligenceData } from './api-client/advertising-intelligence-types.js';
export type { DigiAuditStatusView } from './api-client/audit-types.js';
export type { DigiItemStateView } from './api-client/audit-types.js';
export type { DigiAuditItemView } from './api-client/audit-types.js';
export type { DigiAuditView } from './api-client/audit-types.js';
export type { NicheWhiteView } from './api-client/niche-types.js';
export type { NicheView } from './api-client/niche-types.js';
export type { ShieldCompressionMode } from './api-client/media-types.js';
export type { ShieldJobStatusView } from './api-client/media-types.js';
export type { ShieldVerifyStatusView } from './api-client/media-types.js';
export type { ShieldJobView } from './api-client/media-types.js';
export type { MediaCompressionMode } from './api-client/media-types.js';
export type { MediaAspectRatio } from './api-client/media-types.js';
export type { MediaExtensionMode } from './api-client/media-types.js';
export type { CreateMediaJobInput } from './api-client/media-types.js';
export type { MediaJobView } from './api-client/media-types.js';
export { ApiError } from './query-client.js';
export const apiClient = {
  ...adsIntelligenceEndpoints,
  ...syzepayEndpoints,
  ...tiktokEndpoints,
  ...googleAdsEndpoints,
  ...metaControlEndpoints,
  ...utmifyGlobalEndpoints,
  ...authEndpoints,
  ...usersEndpoints,
  ...adminEndpoints,
  ...offersEndpoints,
  ...trackingSetupEndpoints,
  ...trackingFinanceEndpoints,
  ...refundsEndpoints,
  ...recoveryEndpoints,
  ...trackingProductsEndpoints,
  ...pushcutEndpoints,
  ...trackingAdvancedEndpoints,
  ...trackingEntryLinksEndpoints,
  ...trackingUpsellsEndpoints,
  ...trackingUpsellAuditEndpoints,
  ...trackingEventsEndpoints,
  ...metaDeliveryEndpoints,
  ...utmifyEndpoints,
  ...offerAiEndpoints,
  ...dashboardEndpoints,
  ...clonesEndpoints,
  ...cloneLinksEndpoints,
  ...nichesEndpoints,
  ...shieldEndpoints,
  ...mediaEndpoints,
  ...auditsEndpoints,
};
