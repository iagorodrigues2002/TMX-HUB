export type AssetKind = 'image' | 'stylesheet' | 'font' | 'media' | 'other';

export interface AssetEntry {
  id: string;
  url: string;
  originalUrl: string;
  kind: AssetKind;
  mime: string;
  size: number;
  hash: string;
  storageKey?: string;
}

export interface AssetManifest {
  entries: AssetEntry[];
  byUrl: Record<string, string>;
}

export type FormMode = 'keep' | 'replace' | 'capture_redirect' | 'disable';

export interface FormField {
  name: string;
  type: string;
  value?: string;
  hidden: boolean;
  required: boolean;
}

export interface Form {
  id: string;
  selector: string;
  originalAction: string;
  currentAction: string;
  method: 'GET' | 'POST';
  mode: FormMode;
  redirectTo?: string;
  fields: FormField[];
}

export interface Link {
  id: string;
  selector: string;
  originalHref: string;
  currentHref: string;
  text: string;
  rel?: string;
  isExternal: boolean;
  isCta: boolean;
}

export type CloneStatus =
  | 'queued'
  | 'rendering'
  | 'sanitizing'
  | 'resolving_assets'
  | 'ready'
  | 'failed';

export type RenderMode = 'static' | 'js';
export type Escalation = 'off' | 'auto' | 'max';

export interface LinkReplacement {
  from: string;
  to: string;
}

export interface CloneOptions {
  renderMode?: RenderMode;
  inlineAssets?: boolean;
  userAgent?: string;
  viewport?: { width: number; height: number };
  escalation?: Escalation;
  webhookUrl?: string;
  linkReplacements?: LinkReplacement[];
  keepScriptSrcs?: string[];
}

export interface InspectCheckoutLink {
  href: string;
  text: string;
  occurrences: number;
}

export interface InspectHeadScript {
  src: string;
  type: string | null;
}

export interface InspectResult {
  url: string;
  finalUrl: string;
  checkoutLinks: InspectCheckoutLink[];
  headScripts: InspectHeadScript[];
  inlineScriptCount: number;
}

export interface CloneState {
  jobId: string;
  sourceUrl: string;
  finalUrl: string;
  status: CloneStatus;
  html: string;
  assets: AssetManifest;
  forms: Form[];
  links: Link[];
  createdAt: string;
  updatedAt: string;
  error?: { code: string; message: string };
}

export type BundleFormat = 'html' | 'zip';

export interface BundleOptions {
  format: BundleFormat;
  inlineAssets?: boolean;
  applyEdits?: boolean;
}

export type BuildStatus = 'queued' | 'building' | 'ready' | 'failed';

export interface BuildJob {
  id: string;
  jobId: string;
  status: BuildStatus;
  format: BundleFormat;
  downloadUrl?: string;
  bytes?: number;
  createdAt: string;
  updatedAt: string;
  error?: { code: string; message: string };
}

// ---- VSL Downloader ----

export type VslJobStatus =
  | 'queued'
  | 'analyzing'
  | 'extracting'
  | 'downloading'
  | 'processing'
  | 'uploading'
  | 'ready'
  | 'failed';

export type VslManifestKind = 'hls' | 'dash' | 'mp4';

export interface VslJob {
  id: string;
  url: string;
  status: VslJobStatus;
  progress: number;
  /** Black variant (paid traffic). When no cloaker, this is the only manifest. */
  manifestUrl?: string;
  manifestKind?: VslManifestKind;
  bytes?: number;
  durationSec?: number;
  filename?: string;
  storageKey?: string;
  /** True if the page returned a different manifest for organic vs paid traffic. */
  cloakerDetected?: boolean;
  /** White variant (organic traffic). Only present when cloakerDetected. */
  whiteManifestUrl?: string;
  whiteFilename?: string;
  whiteStorageKey?: string;
  whiteBytes?: number;
  expiresAt?: string;
  errorCode?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateVslJobRequest {
  url: string;
}

export interface VslObservedMedia {
  url: string;
  kind: 'hls' | 'dash' | 'mp4' | 'segment' | 'unknown';
  source: 'extension' | 'content-type' | 'body-sniff' | 'segment-inference';
}

// ---- Funnel Full Clone ----

export type FunnelJobStatus =
  | 'queued'
  | 'crawling'
  | 'packaging'
  | 'uploading'
  | 'ready'
  | 'failed';

export interface FunnelPage {
  url: string;
  /** BFS depth from the root URL (root = 0). */
  depth: number;
  /** 0-indexed visit order, used for the "01-...", "02-..." naming. */
  index: number;
  /** Display label inferred from the link that brought us here, or page <title>. */
  label: string;
  /** HTML byte size after sanitize/asset-resolve. */
  bytes?: number;
  /** Final URL after redirects. */
  finalUrl?: string;
  /** Discovery error, if any. */
  error?: string;
}

export interface FunnelJob {
  id: string;
  rootUrl: string;
  status: FunnelJobStatus;
  progress: number;
  maxDepth: number;
  maxPages: number;
  pages: FunnelPage[];
  totalBytes?: number;
  filename?: string;
  storageKey?: string;
  expiresAt?: string;
  errorCode?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateFunnelJobRequest {
  url: string;
  max_depth?: number;
  max_pages?: number;
}

// ---- Auth & Activity ----

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
  createdAt: string;
}

export interface AuthSession {
  user: User;
  token: string;
  expiresAt: string;
}

export type ActivityKind = 'clone' | 'vsl' | 'funnel' | 'inspect' | 'webhook' | 'page-diff';

export interface ActivityEntry {
  kind: ActivityKind;
  id: string;
  /** Best display label (URL or label depending on kind). */
  label: string;
  /** kind-specific status string. */
  status: string;
  createdAt: string;
}

// ---- Dashboard / Offers ----

/**
 * An "offer" is one product/funnel you're driving traffic to. Each offer
 * has its own daily snapshots aggregated from UTMify (or any source via
 * /v1/offers/:id/ingest). Rendered as a sub-dashboard.
 */
/** Stages we track per offer in the DR pipeline. */
export type OfferStatus = 'testando' | 'validando' | 'escala' | 'pausado' | 'morrendo';

/**
 * One link for an offer. Each slot has white (safe page shown to bots /
 * platform reviewers) and black (real money page). Either can be empty.
 */
export interface OfferLink {
  id: string;
  /** Optional human label, e.g. "Front BR PT" or "Upsell Garantia". */
  label?: string;
  whiteUrl?: string;
  blackUrl?: string;
}

export interface Offer {
  id: string;
  userId: string;
  name: string;          // ex. "PFL_ENG"
  /** UTMify dashboardId, kept for reference + auto-config in n8n. */
  dashboardId?: string;
  description?: string;
  status: OfferStatus;
  /** Front links (LP / VSL). At least one expected when active. */
  fronts: OfferLink[];
  /** Upsell links (post-checkout flow). */
  upsells: OfferLink[];
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

/**
 * Aggregated metrics for one offer on one day. Idempotent on
 * (offerId, date) — re-ingesting overwrites.
 */
export interface DailySnapshot {
  offerId: string;
  date: string;          // YYYY-MM-DD
  spend: number;         // BRL
  sales: number;         // count
  revenue: number;       // BRL
  ic: number;            // initiate checkout count
  impressions?: number;
  clicks?: number;
  adsets?: AdsetSnapshot[];
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
  name: string;
  dashboard_id?: string;
  description?: string;
  status?: OfferStatus;
}

export interface UpdateOfferRequest {
  name?: string;
  dashboard_id?: string;
  description?: string;
  status?: OfferStatus;
  fronts?: OfferLink[];
  upsells?: OfferLink[];
}

// ---- Video Shield (cloaker) ----

/**
 * A "niche" is a category of white-audio scripts (e.g. "Saúde", "Finanças").
 * Each niche owns one or more white audios; when a video is shielded, one
 * of the niche's whites is randomly picked and mixed in.
 */
export interface NicheWhite {
  id: string;
  /** Original filename when uploaded. */
  filename: string;
  /** R2 storage key. */
  storageKey: string;
  /** Bytes of the audio file. */
  bytes: number;
  /** Optional human label (defaults to filename). */
  label?: string;
  createdAt: string;
}

export interface Niche {
  id: string;
  userId: string;
  name: string;
  description?: string;
  whites: NicheWhite[];
  createdAt: string;
  updatedAt?: string;
}

export type ShieldCompressionMode = 'none' | 'lossless' | 'balanced' | 'small';

export type ShieldJobStatus = 'queued' | 'processing' | 'verifying' | 'ready' | 'failed';

export type ShieldVerifyStatus = 'pending' | 'done' | 'failed' | 'skipped';

export interface ShieldJob {
  id: string;
  userId: string;
  /** Source video stored in R2 (input). */
  inputStorageKey: string;
  inputFilename: string;
  inputBytes: number;
  /** Niche selected for this job. */
  nicheId: string;
  nicheName: string;
  /** White audio actually picked (random) for this job. */
  whiteId: string;
  whiteLabel: string;
  /** White audio gain in dB (negative; e.g. -22). */
  whiteVolumeDb: number;
  /** Compression mode applied. */
  compression: ShieldCompressionMode;
  /** Whether to run AssemblyAI verification on the output. */
  verifyTranscript: boolean;
  status: ShieldJobStatus;
  /** Output video storage key (only when ready). */
  outputStorageKey?: string;
  outputFilename?: string;
  outputBytes?: number;
  /** Optional transcript from AssemblyAI verification. */
  transcript?: string;
  transcriptStatus?: ShieldVerifyStatus;
  /** Error from AssemblyAI when transcriptStatus === 'failed'. */
  transcriptError?: string;
  /** Free-form error text when status === 'failed'. */
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateNicheRequest {
  name: string;
  description?: string;
}

export interface UpdateNicheRequest {
  name?: string;
  description?: string;
}

export interface CreateShieldJobRequest {
  niche_id: string;
  white_volume_db?: number;        // default -22
  compression?: ShieldCompressionMode; // default 'none'
  verify_transcript?: boolean;     // default false
}

// ---- Digistore24 Approval Audit ----

export type DigiAuditStatus =
  | 'draft'
  | 'in_review'
  | 'approved'
  | 'rejected'
  | 'abandoned';

export type DigiItemState = 'pending' | 'done' | 'na';

export interface DigiAuditItem {
  state: DigiItemState;
  notes?: string;
  /** Optional URL the user pasted for this item (e.g. sales page URL). */
  url?: string;
}

export interface DigiAudit {
  id: string;
  userId: string;
  productName: string;
  /** Optional link to a TMX HUB Offer. */
  offerId?: string;
  status: DigiAuditStatus;
  /** Per-item state map keyed by `${sectionId}:${itemId}`. */
  items: Record<string, DigiAuditItem>;
  /** Overall free-form notes for the audit. */
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDigiAuditRequest {
  product_name: string;
  offer_id?: string;
}

export interface UpdateDigiAuditRequest {
  product_name?: string;
  offer_id?: string;
  status?: DigiAuditStatus;
  notes?: string;
  /** Replace one item state (partial — keys not present are kept). */
  items?: Record<string, DigiAuditItem>;
}
