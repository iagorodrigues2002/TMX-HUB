import type {
  BuildJob,
  BuildOptionsRequest,
  BulkLinkUpdate,
  CloneState,
  Form,
  FunnelJob,
  FunnelJobStatus,
  FunnelPage,
  InspectResult,
  Link,
  Problem,
  UpdateFormRequest,
  UpdateLinkRequest,
  VslJob,
  VslJobStatus,
  VslManifestKind,
} from '@page-cloner/shared';
import { CreateCloneRequestSchema } from '@page-cloner/shared';
import type { z } from 'zod';
import { env } from './env.js';
import { ApiError } from './query-client.js';

// The API uses snake_case in the wire format per OpenAPI; shared types use
// camelCase. The client converts at the boundary so the rest of the app
// stays in TS-idiomatic shape.

interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    next_cursor: string | null;
    limit: number;
    total_estimate?: number;
  };
}

export interface ListResult<T> {
  data: T[];
  nextCursor: string | null;
  limit: number;
  totalEstimate?: number;
}

export interface BulkLinkUpdateResult {
  matched: number;
  updated: number;
  affectedIds: string[];
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

const TOKEN_STORAGE_KEY = 'tmx-hub:auth-token';

export const authToken = {
  get(): string | null {
    if (typeof window === 'undefined') return null;
    try {
      return window.localStorage.getItem(TOKEN_STORAGE_KEY);
    } catch {
      return null;
    }
  },
  set(token: string): void {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } catch {
      // ignore
    }
  },
  clear(): void {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    } catch {
      // ignore
    }
  },
};

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const baseUrl = env.NEXT_PUBLIC_API_URL;
  const url = `${baseUrl}${path}`;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...opts.headers,
  };
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  // Inject auth token automatically when present.
  const token = authToken.get();
  if (token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
      cache: 'no-store',
    });
  } catch (err) {
    // The browser's "Failed to fetch" is opaque. Try to surface the real cause:
    // CORS, mixed content, DNS, offline, etc. — and always include the URL.
    const cause = (err as Error)?.message || 'unknown error';
    const pageOrigin = typeof window !== 'undefined' ? window.location.origin : 'server';
    const pageProto = typeof window !== 'undefined' ? window.location.protocol : 'unknown:';
    let apiProto = 'unknown:';
    try {
      apiProto = new URL(baseUrl).protocol;
    } catch {
      // ignore — env validates URL at boot, but be defensive.
    }
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;

    let hint = '';
    if (offline) {
      hint = ' (browser is offline)';
    } else if (pageProto === 'https:' && apiProto === 'http:') {
      hint = ' (mixed content blocked: page is HTTPS but API URL is HTTP)';
    } else if (cause.toLowerCase().includes('failed to fetch')) {
      hint = ' (CORS, DNS failure, API down, or unreachable)';
    }

    const fullMsg =
      `Falha ao chamar a API: ${cause}${hint}` +
      `\n  URL: ${opts.method ?? 'GET'} ${url}` +
      `\n  Origem: ${pageOrigin}` +
      `\n  API base: ${baseUrl}`;

    if (typeof console !== 'undefined') {
      console.error('[api-client] request failed', {
        method: opts.method ?? 'GET',
        url,
        baseUrl,
        pageOrigin,
        offline,
        cause,
        error: err,
      });
    }

    throw new ApiError(fullMsg, 0);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const text = await res.text();
  const json = text ? safeJsonParse(text) : null;

  if (!res.ok) {
    const problem = json as Problem | null;
    const message = problem?.detail ?? problem?.title ?? `HTTP ${res.status}`;
    throw new ApiError(message, res.status, problem);
  }

  return json as T;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// ---- snake/camel converters (narrow, hand-rolled — the API surface is small) ----

interface CloneJobWire {
  id: string;
  status: CloneState['status'];
  url: string;
  final_url?: string;
  progress?: number;
  options?: {
    render_mode?: 'static' | 'js';
    inline_assets?: boolean;
    user_agent?: string;
    viewport?: { width: number; height: number };
  };
  counts?: {
    forms?: number;
    links?: number;
    assets?: number;
    bytes?: number;
  };
  error?: { code: string; message: string };
  rendered_at?: string;
  created_at: string;
  updated_at: string;
  links?: {
    self?: string;
    preview?: string;
    forms?: string;
    links_collection?: string;
  };
}

export interface CloneJob {
  id: string;
  status: CloneState['status'];
  url: string;
  finalUrl?: string;
  progress?: number;
  counts?: {
    forms?: number;
    links?: number;
    assets?: number;
    bytes?: number;
  };
  error?: { code: string; message: string };
  renderedAt?: string;
  createdAt: string;
  updatedAt: string;
}

function fromCloneJobWire(w: CloneJobWire): CloneJob {
  return {
    id: w.id,
    status: w.status,
    url: w.url,
    finalUrl: w.final_url,
    progress: w.progress,
    counts: w.counts
      ? {
          forms: w.counts.forms,
          links: w.counts.links,
          assets: w.counts.assets,
          bytes: w.counts.bytes,
        }
      : undefined,
    error: w.error,
    renderedAt: w.rendered_at,
    createdAt: w.created_at,
    updatedAt: w.updated_at,
  };
}

interface FormWire {
  id: string;
  selector: string;
  original_action: string;
  current_action: string;
  method: string;
  mode: Form['mode'];
  redirect_to?: string | null;
  fields: Array<{
    name: string;
    type: string;
    value?: string;
    hidden: boolean;
    required?: boolean;
    placeholder?: string;
  }>;
  updated_at: string;
}

function fromFormWire(w: FormWire): Form {
  return {
    id: w.id,
    selector: w.selector,
    originalAction: w.original_action,
    currentAction: w.current_action,
    method: (w.method === 'GET' ? 'GET' : 'POST') as Form['method'],
    mode: w.mode,
    redirectTo: w.redirect_to ?? undefined,
    fields: w.fields.map((f) => ({
      name: f.name,
      type: f.type,
      value: f.value,
      hidden: f.hidden,
      required: Boolean(f.required),
    })),
  };
}

interface LinkWire {
  id: string;
  selector: string;
  original_href: string;
  current_href: string;
  text?: string;
  rel?: string;
  is_external?: boolean;
  is_cta: boolean;
  updated_at: string;
}

function fromLinkWire(w: LinkWire): Link {
  return {
    id: w.id,
    selector: w.selector,
    originalHref: w.original_href,
    currentHref: w.current_href,
    text: w.text ?? '',
    rel: w.rel,
    isExternal: Boolean(w.is_external),
    isCta: w.is_cta,
  };
}

interface BuildJobWire {
  id: string;
  clone_id: string;
  status: BuildJob['status'];
  options: {
    format: 'html' | 'zip';
    include_assets?: boolean;
  };
  artifact?: {
    bytes: number;
    content_type: string;
    sha256: string;
    filename: string;
  };
  download_url?: string;
  download_expires_at?: string;
  error?: { code: string; message: string };
  created_at: string;
  updated_at: string;
}

function fromBuildJobWire(w: BuildJobWire): BuildJob {
  return {
    id: w.id,
    jobId: w.clone_id,
    status: w.status,
    format: w.options.format,
    downloadUrl: w.download_url,
    bytes: w.artifact?.bytes,
    createdAt: w.created_at,
    updatedAt: w.updated_at,
    error: w.error,
  };
}

// ---- VSL job (snake/camel) ----

interface VslJobWire {
  id: string;
  url: string;
  status: VslJobStatus;
  progress: number;
  manifest_url?: string;
  manifest_kind?: VslManifestKind;
  bytes?: number;
  duration_sec?: number;
  filename?: string;
  storage_key?: string;
  cloaker_detected?: boolean;
  white_manifest_url?: string;
  white_filename?: string;
  white_storage_key?: string;
  white_bytes?: number;
  white_download_url?: string;
  expires_at?: string;
  download_url?: string;
  error?: { code: string; message: string };
  created_at: string;
  updated_at: string;
}

export interface VslJobView extends VslJob {
  downloadUrl?: string;
  whiteDownloadUrl?: string;
  error?: { code: string; message: string };
}

function fromVslJobWire(w: VslJobWire): VslJobView {
  return {
    id: w.id,
    url: w.url,
    status: w.status,
    progress: w.progress,
    manifestUrl: w.manifest_url,
    manifestKind: w.manifest_kind,
    bytes: w.bytes,
    durationSec: w.duration_sec,
    filename: w.filename,
    storageKey: w.storage_key,
    cloakerDetected: w.cloaker_detected,
    whiteManifestUrl: w.white_manifest_url,
    whiteFilename: w.white_filename,
    whiteStorageKey: w.white_storage_key,
    whiteBytes: w.white_bytes,
    expiresAt: w.expires_at,
    createdAt: w.created_at,
    updatedAt: w.updated_at,
    downloadUrl: w.download_url,
    whiteDownloadUrl: w.white_download_url,
    error: w.error,
  };
}

// ---- Funnel job (snake/camel) ----

interface FunnelJobWire {
  id: string;
  root_url: string;
  status: FunnelJobStatus;
  progress: number;
  max_depth: number;
  max_pages: number;
  pages: FunnelPage[];
  total_bytes?: number;
  filename?: string;
  storage_key?: string;
  expires_at?: string;
  download_url?: string;
  error?: { code: string; message: string };
  created_at: string;
  updated_at: string;
}

export interface FunnelJobView extends FunnelJob {
  downloadUrl?: string;
  error?: { code: string; message: string };
}

function fromFunnelJobWire(w: FunnelJobWire): FunnelJobView {
  return {
    id: w.id,
    rootUrl: w.root_url,
    status: w.status,
    progress: w.progress,
    maxDepth: w.max_depth,
    maxPages: w.max_pages,
    pages: w.pages ?? [],
    totalBytes: w.total_bytes,
    filename: w.filename,
    storageKey: w.storage_key,
    expiresAt: w.expires_at,
    downloadUrl: w.download_url,
    error: w.error,
    createdAt: w.created_at,
    updatedAt: w.updated_at,
  };
}

// ---- Auth ----

/**
 * Tools/áreas que podem aparecer em `allowedTools`. Quando ausente/vazio,
 * acesso é total. Admin sempre bypassa.
 */
export type ToolKey =
  | 'cloner'
  | 'cloaker-urls'
  | 'video-shield'
  | 'creative-studio'
  | 'page-diff'
  | 'funnel-clone'
  | 'upsell-analyzer'
  | 'webhook-tester'
  | 'vsl'
  | 'digi-approval'
  | 'ofertas'
  | 'ofertas-ia'
  | 'logs';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  companyName?: string;
  role: 'admin' | 'user';
  allowedTools?: ToolKey[];
  createdAt: string;
}

/** Helper central de checagem de acesso a uma tool. */
export function canAccessTool(user: AuthUser | null, tool: ToolKey): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const list = user.allowedTools;
  if (!list || list.length === 0) return true;
  if (tool === 'video-shield' || tool === 'creative-studio') {
    return list.includes('video-shield') || list.includes('creative-studio');
  }
  return list.includes(tool);
}

export function canAccessOfferAi(user: AuthUser | null): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return user.allowedTools?.includes('ofertas-ia') ?? false;
}

interface AuthSessionWire {
  user: {
    id: string;
    email: string;
    name: string;
    role: 'admin' | 'user';
    allowedTools?: ToolKey[];
    createdAt: string;
  };
  token: string;
  expires_at: string;
}

// ---- Invites ----

export interface InviteView {
  token: string;
  email?: string;
  name?: string;
  createdAt: string;
  expiresAt: string;
  invitedBy?: string;
  allowedTools?: ToolKey[];
}

interface InviteWire {
  token: string;
  email?: string;
  name?: string;
  created_at: string;
  expires_at: string;
  invited_by?: string;
  allowed_tools?: ToolKey[];
}

function fromInviteWire(w: InviteWire): InviteView {
  return {
    token: w.token,
    email: w.email,
    name: w.name,
    createdAt: w.created_at,
    expiresAt: w.expires_at,
    invitedBy: w.invited_by,
    allowedTools: w.allowed_tools,
  };
}

// ---- Offers / Dashboards ----

export type OfferStatus = 'testando' | 'validando' | 'escala' | 'pausado' | 'morrendo';

export interface OfferView {
  id: string;
  memberIds: string[];
  name: string;
  companyName?: string;
  dashboardId?: string;
  currency: string;
  utmifyConfigured: boolean;
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

export interface RecoveryView {
  settings: {
    checkout_url: string | null;
    sender_name: string;
    quiet_start: number;
    quiet_end: number;
    enabled: boolean;
  } | null;
  sources: {
    gateway: string | null;
    gateway_enabled: boolean;
    ab_test: string | null;
    ab_destinations: number;
    entry_links: number;
    entry_clicks: number;
    vendepay_webhooks: number;
    checkout_destinations: number;
    automatic: boolean;
  };
  channels: Array<{
    id: string;
    kind: 'whatsapp' | 'sms' | 'email';
    enabled: boolean;
    configured: boolean;
    config: Record<string, string>;
    from_email?: string | null;
    updated_at: string;
  }>;
  totals: {
    eligible: number;
    contacted: number;
    clicked: number;
    recovered: number;
    recovered_minor: string;
  };
  email_metrics: {
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    converted: number;
    recovered_minor: string;
    open_rate: number;
    click_rate: number;
    conversion_rate: number;
  };
  opportunities: Array<{
    id: string;
    status: string;
    reason: string;
    buyer_name: string | null;
    email: string | null;
    phone: string | null;
    has_email: boolean;
    has_phone: boolean;
    created_at: string;
    last_contact_at: string | null;
    clicked_at: string | null;
    recovered_at: string | null;
    external_id: string;
    amount_minor: number | null;
    amount_brl_minor: number | null;
    currency: string | null;
    product: { name?: string } | null;
    messages: number;
    last_message_state: string | null;
    email_delivered_at: string | null;
    email_opened_at: string | null;
    email_clicked_at: string | null;
  }>;
}

export interface DashboardSummary {
  from: string;
  to: string;
  totals: MetricsView;
  currencyTotals: Array<{ currency: string; totals: MetricsView }>;
  offers: DashboardOfferEntry[];
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

interface OfferAiConfigWire {
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

interface OfferWire {
  id: string;
  member_ids?: string[];
  name: string;
  company_name?: string;
  dashboard_id?: string;
  currency?: string;
  utmify_configured?: boolean;
  utmify_login_hint?: string;
  sync_status?: 'idle' | 'syncing' | 'success' | 'partial' | 'error';
  last_sync_at?: string;
  last_sync_error?: string;
  description?: string;
  status?: OfferStatus;
  created_at: string;
  updated_at?: string;
}

interface OfferSnapshotsWire {
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

interface DashboardSummaryWire {
  from: string;
  to: string;
  totals: MetricsView;
  currency_totals?: Array<{ currency: string; totals: MetricsView }>;
  offers: Array<{
    offer: OfferWire;
    totals: MetricsView;
    snapshots_count: number;
  }>;
}

function fromOfferWire(w: OfferWire): OfferView {
  return {
    id: w.id,
    memberIds: w.member_ids ?? [],
    name: w.name,
    companyName: w.company_name,
    dashboardId: w.dashboard_id,
    currency: w.currency ?? 'BRL',
    utmifyConfigured: Boolean(w.utmify_configured),
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

function fromOfferSnapshotsWire(w: OfferSnapshotsWire): OfferSnapshotsView {
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

function fromDashboardSummaryWire(w: DashboardSummaryWire): DashboardSummary {
  return {
    from: w.from,
    to: w.to,
    totals: w.totals,
    currencyTotals: w.currency_totals ?? [{ currency: 'BRL', totals: w.totals }],
    offers: (w.offers ?? []).map((e) => ({
      offer: fromOfferWire(e.offer),
      totals: e.totals,
      snapshotsCount: e.snapshots_count,
    })),
  };
}

// ---- public methods ----

export const apiClient = {
  baseUrl: env.NEXT_PUBLIC_API_URL,

  async login(email: string, password: string): Promise<{ user: AuthUser; token: string }> {
    const wire = await request<AuthSessionWire>('/v1/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    return { user: wire.user, token: wire.token };
  },

  async register(
    email: string,
    name: string,
    password: string,
    inviteToken?: string,
  ): Promise<{ user: AuthUser; token: string }> {
    const wire = await request<AuthSessionWire>('/v1/auth/register', {
      method: 'POST',
      body: {
        email,
        name,
        password,
        ...(inviteToken ? { invite_token: inviteToken } : {}),
      },
    });
    return { user: wire.user, token: wire.token };
  },

  async me(): Promise<AuthUser> {
    const wire = await request<{ user: AuthUser }>('/v1/auth/me');
    return wire.user;
  },

  // ---- Invites (admin only) ----
  async checkInvite(token: string): Promise<{
    valid: boolean;
    email?: string;
    name?: string;
    expiresAt?: string;
    invitedBy?: string;
    allowedTools?: ToolKey[];
    detail?: string;
  }> {
    try {
      const wire = await request<{
        valid: boolean;
        email?: string;
        name?: string;
        expires_at?: string;
        invited_by?: string;
        allowed_tools?: ToolKey[];
      }>(`/v1/auth/invites/${encodeURIComponent(token)}`);
      return {
        valid: wire.valid,
        email: wire.email,
        name: wire.name,
        expiresAt: wire.expires_at,
        invitedBy: wire.invited_by,
        allowedTools: wire.allowed_tools,
      };
    } catch (err) {
      const e = err as ApiError;
      if (e.status === 404) return { valid: false, detail: 'Convite inválido ou expirado.' };
      throw err;
    }
  },

  async listInvites(): Promise<InviteView[]> {
    const wire = await request<{ invites: InviteWire[] }>('/v1/auth/invites');
    return (wire.invites ?? []).map(fromInviteWire);
  },

  async createInvite(input: {
    email?: string;
    name?: string;
    expiresInDays?: number;
    allowedTools?: ToolKey[];
  }): Promise<InviteView> {
    const wire = await request<InviteWire>('/v1/auth/invites', {
      method: 'POST',
      body: {
        ...(input.email ? { email: input.email } : {}),
        ...(input.name ? { name: input.name } : {}),
        ...(input.expiresInDays ? { expires_in_days: input.expiresInDays } : {}),
        ...(input.allowedTools && input.allowedTools.length > 0
          ? { allowed_tools: input.allowedTools }
          : {}),
      },
    });
    return fromInviteWire(wire);
  },

  async revokeInvite(token: string): Promise<void> {
    await request<void>(`/v1/auth/invites/${encodeURIComponent(token)}`, {
      method: 'DELETE',
    });
  },

  // ---- Users (admin only) ----
  async listUsers(): Promise<AuthUser[]> {
    const wire = await request<{
      users: Array<{
        id: string;
        email: string;
        name: string;
        role: 'admin' | 'user';
        allowed_tools?: ToolKey[];
        created_at: string;
      }>;
    }>('/v1/users');
    return (wire.users ?? []).map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      allowedTools: u.allowed_tools,
      createdAt: u.created_at,
    }));
  },

  async updateUser(
    id: string,
    patch: {
      name?: string;
      role?: 'admin' | 'user';
      /** undefined = não muda. null = limpa (acesso total). array = sobrescreve. */
      allowedTools?: ToolKey[] | null;
    },
  ): Promise<AuthUser> {
    const body: Record<string, unknown> = {};
    if (patch.name !== undefined) body.name = patch.name;
    if (patch.role !== undefined) body.role = patch.role;
    if (patch.allowedTools !== undefined) body.allowed_tools = patch.allowedTools;
    const wire = await request<{
      id: string;
      email: string;
      name: string;
      role: 'admin' | 'user';
      allowed_tools?: ToolKey[];
      created_at: string;
    }>(`/v1/users/${id}`, { method: 'PATCH', body });
    return {
      id: wire.id,
      email: wire.email,
      name: wire.name,
      role: wire.role,
      allowedTools: wire.allowed_tools,
      createdAt: wire.created_at,
    };
  },

  async deleteUser(id: string): Promise<void> {
    await request<void>(`/v1/users/${id}`, { method: 'DELETE' });
  },

  async getAdminOverview(): Promise<{
    totals: { users: number; admins: number; restricted: number; active30d: number };
    users: Array<AuthUser & { activityCount: number; lastActivityAt?: string }>;
    recentActivity: Array<{
      kind: 'clone' | 'vsl' | 'funnel' | 'inspect' | 'webhook' | 'page-diff';
      id: string;
      label: string;
      status: string;
      createdAt: string;
      userId: string;
      userName: string;
    }>;
  }> {
    type ActivityWire = {
      kind: 'clone' | 'vsl' | 'funnel' | 'inspect' | 'webhook' | 'page-diff';
      id: string;
      label: string;
      status: string;
      createdAt: string;
      user_id: string;
      user_name: string;
    };
    type UserWire = {
      id: string;
      email: string;
      name: string;
      role: 'admin' | 'user';
      allowed_tools?: ToolKey[];
      created_at: string;
      activity_count: number;
      last_activity_at?: string;
    };
    const wire = await request<{
      totals: { users: number; admins: number; restricted: number; active_30d: number };
      users: UserWire[];
      recent_activity: ActivityWire[];
    }>('/v1/admin/overview');
    return {
      totals: {
        users: wire.totals.users,
        admins: wire.totals.admins,
        restricted: wire.totals.restricted,
        active30d: wire.totals.active_30d,
      },
      users: wire.users.map((user) => ({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        allowedTools: user.allowed_tools,
        createdAt: user.created_at,
        activityCount: user.activity_count,
        lastActivityAt: user.last_activity_at,
      })),
      recentActivity: wire.recent_activity.map((entry) => ({
        kind: entry.kind,
        id: entry.id,
        label: entry.label,
        status: entry.status,
        createdAt: entry.createdAt,
        userId: entry.user_id,
        userName: entry.user_name,
      })),
    };
  },

  async listActivity(): Promise<
    Array<{
      kind: 'clone' | 'vsl' | 'funnel' | 'inspect' | 'webhook' | 'page-diff';
      id: string;
      label: string;
      status: string;
      createdAt: string;
    }>
  > {
    const wire = await request<{
      entries: Array<{
        kind: 'clone' | 'vsl' | 'funnel' | 'inspect' | 'webhook' | 'page-diff';
        id: string;
        label: string;
        status: string;
        createdAt: string;
      }>;
    }>('/v1/activity');
    return wire.entries;
  },

  async inspectPage(url: string, signal?: AbortSignal): Promise<InspectResult> {
    return request<InspectResult>('/v1/inspect', { method: 'POST', body: { url }, signal });
  },

  async createFunnelJob(input: {
    url: string;
    max_depth?: number;
    max_pages?: number;
  }): Promise<FunnelJobView> {
    const wire = await request<FunnelJobWire>('/v1/funnel-jobs', {
      method: 'POST',
      body: input,
    });
    return fromFunnelJobWire(wire);
  },

  async getFunnelJob(id: string, signal?: AbortSignal): Promise<FunnelJobView> {
    const wire = await request<FunnelJobWire>(`/v1/funnel-jobs/${id}`, { signal });
    return fromFunnelJobWire(wire);
  },

  // ---- Dashboards / Offers ----

  async listOffers(): Promise<OfferView[]> {
    const wire = await request<{ offers: OfferWire[] }>('/v1/offers');
    return (wire.offers ?? []).map(fromOfferWire);
  },

  async createOffer(input: {
    name: string;
    company_name?: string;
    dashboard_id?: string;
    description?: string;
    status?: OfferStatus;
    utmify_login?: string;
    utmify_password?: string;
    member_ids?: string[];
  }): Promise<OfferView> {
    const wire = await request<OfferWire>('/v1/offers', { method: 'POST', body: input });
    return fromOfferWire(wire);
  },

  async updateOffer(
    id: string,
    patch: {
      name?: string;
      company_name?: string;
      dashboard_id?: string;
      description?: string;
      status?: OfferStatus;
      utmify_login?: string;
      utmify_password?: string;
      member_ids?: string[];
    },
  ): Promise<OfferView> {
    const wire = await request<OfferWire>(`/v1/offers/${id}`, { method: 'PATCH', body: patch });
    return fromOfferWire(wire);
  },

  async deleteOffer(id: string): Promise<void> {
    await request<void>(`/v1/offers/${id}`, { method: 'DELETE' });
  },

  async syncOffer(id: string): Promise<{
    offerId: string;
    syncedDays: number;
    ads: number;
    failedDays?: number;
    skipped?: boolean;
  }> {
    return request(`/v1/offers/${id}/sync`, { method: 'POST' });
  },

  async getUtmifyCapabilities(id: string): Promise<{
    resultKeys: string[];
    accountFields: Array<Record<string, string | number | boolean>>;
    currency?: string;
  }> {
    return request(`/v1/offers/${id}/utmify-capabilities`);
  },

  async getOfferIntraday(id: string, date?: string): Promise<IntradaySummaryView> {
    const query = date ? `?date=${encodeURIComponent(date)}` : '';
    return request(`/v1/offers/${id}/intraday${query}`);
  },

  async getOfferIntradayRange(
    id: string,
    from: string,
    to: string,
  ): Promise<IntradayRangeSummaryView> {
    const params = new URLSearchParams({ from, to });
    return request(`/v1/offers/${id}/intraday/range?${params.toString()}`);
  },

  async getTrackingConfig(id: string): Promise<{
    configured: boolean;
    project?: { id: string; public_key: string; enabled: boolean; install_code: string };
    vendepay?: {
      configured: boolean;
      enabled: boolean;
      propagation_param: string;
      signing_secret_configured: boolean;
    };
  }> {
    return request(`/v1/offers/${id}/tracking`);
  },

  async setupTracking(id: string): Promise<{
    project_id: string;
    public_key: string;
    install_code: string;
    vendepay_webhook_url: string | null;
    warning: string;
    already_configured?: boolean;
  }> {
    return request(`/v1/offers/${id}/tracking/setup`, { method: 'POST' });
  },

  async rotateVendepayWebhook(id: string): Promise<{
    vendepay_webhook_url: string;
    warning: string;
  }> {
    return request(`/v1/offers/${id}/tracking/vendepay/rotate-token`, { method: 'POST' });
  },

  async saveVendepaySigningSecret(
    id: string,
    signingSecret: string,
  ): Promise<{ configured: boolean; updated_at: string }> {
    return request(`/v1/offers/${id}/tracking/vendepay/signing-secret`, {
      method: 'PUT',
      body: { signing_secret: signingSecret },
    });
  },

  async previewVendepayWebhook(
    id: string,
    payload: unknown,
  ): Promise<{
    processable: boolean;
    diagnostics?: string[];
    normalized?: {
      transactionId: string;
      status: string;
      trackingSrc?: string;
      amountMinor?: number;
      currency?: string;
      paymentMethod?: string;
      product: { id?: string; name?: string; planId?: string; planName?: string };
      source: Record<string, string>;
    };
  }> {
    return request(`/v1/offers/${id}/tracking/vendepay/preview`, {
      method: 'POST',
      body: payload,
    });
  },

  async listVendepayReceipts(id: string): Promise<{
    receipts: Array<{
      id: string;
      state: string;
      diagnostics?: string[];
      received_at: string;
      processed_at?: string;
      transaction_id?: string;
      order_status?: string;
      amount_minor?: string;
      currency?: string;
      payment_method?: string;
      product?: Record<string, string>;
    }>;
  }> {
    return request(`/v1/offers/${id}/tracking/vendepay/receipts`);
  },

  async getTrackingSummary(
    id: string,
    date?: string,
  ): Promise<{
    date: string;
    time_zone: string;
    events: number;
    visitors: number;
    page_views: number;
    ad_clicks: number;
    connected_clicks: number;
    checkouts: number;
    checkout_events: number;
    orders: number;
    paid_orders: number;
    paid_buyers: number;
    upsell_orders: number;
    upsell_2_orders: number;
    unmapped_paid_orders: number;
    orphan_orders: number;
    paid_revenue_minor: string;
    paid_revenue_brl_minor: string;
    paid_revenue_usd_minor: string;
    unconverted_paid_orders: number;
    refunded_orders: number;
    refunded_revenue_brl_minor: string;
    refunded_revenue_usd_minor: string;
    chargeback_orders: number;
    chargeback_revenue_brl_minor: string;
    chargeback_revenue_usd_minor: string;
    webhooks_received: number;
    webhooks_quarantined: number;
    utmify_deliveries_attempted: number;
    utmify_deliveries_lost: number;
    fee_settings: TrackingFeeSettings;
    fee_vendepay_brl_minor: string;
    fee_vendepay_usd_minor: string;
    fee_extra_brl_minor: string;
    fee_extra_usd_minor: string;
    reserve_brl_minor: string;
    reserve_usd_minor: string;
    net_revenue_brl_minor: string;
    net_revenue_usd_minor: string;
    net_available_brl_minor: string;
    net_available_usd_minor: string;
  }> {
    const query = date ? `?date=${encodeURIComponent(date)}` : '';
    return request(`/v1/offers/${id}/tracking/summary${query}`);
  },

  async getTrackingFeeSettings(id: string): Promise<TrackingFeeSettings> {
    return request(`/v1/offers/${id}/tracking/fee-settings`);
  },

  async updateTrackingFeeSettings(
    id: string,
    body: {
      vendepay_fee_pct: number;
      extra_fee_minor: number;
      extra_fee_currency: string;
      reserve_pct: number;
      reserve_days: number;
      payout_days: number;
    },
  ): Promise<TrackingFeeSettings> {
    return request(`/v1/offers/${id}/tracking/fee-settings`, { method: 'PATCH', body });
  },

  async getTrackingRefunds(
    id: string,
    date?: string,
    page = 1,
  ): Promise<{
    date: string;
    time_zone: string;
    items: Array<{
      id: string;
      provider: string;
      external_id: string;
      status: 'refunded' | 'chargeback';
      amount_minor: number | null;
      currency: string | null;
      amount_brl_minor: string | null;
      buyer: { name?: string; email?: string; document?: string };
      order_kind: 'front' | 'upsell' | 'upsell_2' | 'unknown';
      occurred_at: string;
      updated_at: string;
    }>;
    totals: {
      refunded_orders: number;
      refunded_revenue_brl_minor: string;
      chargeback_orders: number;
      chargeback_revenue_brl_minor: string;
    };
    pagination: { page: number; per_page: number; total: number; total_pages: number };
  }> {
    const params = new URLSearchParams();
    if (date) params.set('date', date);
    if (page > 1) params.set('page', String(page));
    const query = params.toString();
    return request(`/v1/offers/${id}/tracking/refunds${query ? `?${query}` : ''}`);
  },

  async getTrackingOverview(
    from?: string,
    to?: string,
  ): Promise<{
    from: string;
    to: string;
    time_zone: string;
    offers: Array<{
      offer_id: string;
      offer_name: string;
      paid_orders: number;
      gross_revenue_brl_minor: string;
      gross_revenue_usd_minor: string;
      failed_orders: number;
      failed_revenue_brl_minor: string;
      failed_revenue_usd_minor: string;
      refunded_orders: number;
      refunded_revenue_brl_minor: string;
      refunded_revenue_usd_minor: string;
      chargeback_orders: number;
      chargeback_revenue_brl_minor: string;
      chargeback_revenue_usd_minor: string;
      fees_brl_minor: string;
      fees_usd_minor: string;
      reserve_brl_minor: string;
      reserve_usd_minor: string;
      net_revenue_brl_minor: string;
      net_revenue_usd_minor: string;
      net_available_brl_minor: string;
      net_available_usd_minor: string;
    }>;
    totals: {
      paid_orders: number;
      gross_revenue_brl_minor: string;
      gross_revenue_usd_minor: string;
      failed_orders: number;
      failed_revenue_brl_minor: string;
      failed_revenue_usd_minor: string;
      refunded_orders: number;
      refunded_revenue_brl_minor: string;
      refunded_revenue_usd_minor: string;
      chargeback_orders: number;
      chargeback_revenue_brl_minor: string;
      chargeback_revenue_usd_minor: string;
      fees_brl_minor: string;
      fees_usd_minor: string;
      reserve_brl_minor: string;
      reserve_usd_minor: string;
      net_revenue_brl_minor: string;
      net_revenue_usd_minor: string;
      net_available_brl_minor: string;
      net_available_usd_minor: string;
    } | null;
  }> {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const query = params.toString();
    return request(`/v1/tracking/overview${query ? `?${query}` : ''}`);
  },

  async getTrackingDiagnostics(id: string): Promise<{
    managed: boolean;
    database: 'ready' | 'unavailable';
    migrations: 'ready' | 'updating' | 'unavailable';
    encryption: 'ready' | 'unavailable';
    schema_version?: number;
    last_event_at?: string;
    last_order_at?: string;
    meta: { pending: number; failed: number };
    utmify: {
      destination_configured: boolean;
      destination_enabled: boolean;
      worker_running: boolean;
      pending: number;
      failed: number;
      dead: number;
      delivered: number;
      last_delivered_at: string | null;
      last_error: string | null;
      hint: string | null;
    };
    detail: string;
  }> {
    return request(`/v1/offers/${id}/tracking/diagnostics`);
  },

  async getTrackingHealth(id: string): Promise<TrackingHealthView> {
    return request(`/v1/offers/${id}/tracking/health`, { signal: AbortSignal.timeout(20_000) });
  },

  async updateTrackingHealthAlert(
    id: string,
    alertId: string,
    action: 'acknowledge' | 'resolve',
  ): Promise<{ ok: true; state: string }> {
    return request(`/v1/offers/${id}/tracking/health/alerts/${alertId}`, {
      method: 'POST',
      body: { action },
    });
  },

  async getRecovery(id: string): Promise<RecoveryView> {
    return request(`/v1/offers/${id}/recovery`);
  },
  async updateRecoverySettings(
    id: string,
    body: {
      checkout_url?: string;
      sender_name: string;
      quiet_start: number;
      quiet_end: number;
      enabled: boolean;
    },
  ): Promise<{ ok: true }> {
    return request(`/v1/offers/${id}/recovery/settings`, { method: 'PUT', body });
  },
  async updateRecoveryChannel(
    id: string,
    body: Record<string, unknown>,
  ): Promise<{
    ok: true;
    kind: string;
    webhook_configured?: boolean;
    webhook_error?: string | null;
  }> {
    return request(`/v1/offers/${id}/recovery/channels`, { method: 'PUT', body });
  },
  async setupRecoveryEmailWebhook(id: string): Promise<{ ok: true; webhook_id: string | null }> {
    return request(`/v1/offers/${id}/recovery/email-webhook`, { method: 'POST' });
  },
  async syncRecovery(
    id: string,
  ): Promise<{ accepted: true; candidates: number; created: number; skipped: number }> {
    return request(`/v1/offers/${id}/recovery/sync`, { method: 'POST' });
  },
  async sendRecovery(
    id: string,
    opportunityId: string,
    channel: 'whatsapp' | 'sms' | 'email',
  ): Promise<{ accepted: true; message_id: string }> {
    return request(`/v1/offers/${id}/recovery/opportunities/${opportunityId}/send`, {
      method: 'POST',
      body: { channel },
    });
  },
  async bulkSendRecovery(
    id: string,
    channel: 'whatsapp' | 'sms' | 'email',
    limit = 100,
  ): Promise<{ accepted: true; selected: number; sent: number; failed: number }> {
    return request(`/v1/offers/${id}/recovery/bulk-send`, {
      method: 'POST',
      body: { channel, limit },
    });
  },

  async getTrackingProductKinds(id: string): Promise<{
    configured: boolean;
    mapped: Array<{
      id: string;
      product_id: string;
      kind: 'front' | 'upsell' | 'upsell_2';
      label: string | null;
      created_at: string;
      updated_at: string;
    }>;
    unmapped: Array<{
      product_id: string;
      product_name: string | null;
      orders: number;
      last_seen_at: string;
    }>;
  }> {
    return request(`/v1/offers/${id}/tracking/product-kinds`);
  },

  async setTrackingProductKind(
    id: string,
    body: { product_id: string; kind: 'front' | 'upsell' | 'upsell_2'; label?: string | null },
  ): Promise<{ id: string; product_id: string; kind: string; label: string | null }> {
    return request(`/v1/offers/${id}/tracking/product-kinds`, {
      method: 'PUT',
      body,
    });
  },

  async deleteTrackingProductKind(id: string, productId: string): Promise<void> {
    await request(`/v1/offers/${id}/tracking/product-kinds/${encodeURIComponent(productId)}`, {
      method: 'DELETE',
    });
  },

  async getTrackingPushcutDestinations(id: string): Promise<{
    destinations: Array<{
      id: string;
      name: string;
      front_notification_name: string;
      upsell_notification_name: string | null;
      devices: string[];
      enabled: boolean;
      created_at: string;
      updated_at: string;
    }>;
  }> {
    return request(`/v1/offers/${id}/tracking/pushcut-destinations`);
  },

  async createTrackingPushcutDestination(
    id: string,
    body: {
      name: string;
      secret: string;
      front_notification_name: string;
      upsell_notification_name?: string | null;
      devices?: string[];
    },
  ): Promise<{ destination: { id: string; name: string } }> {
    return request(`/v1/offers/${id}/tracking/pushcut-destinations`, {
      method: 'POST',
      body,
    });
  },

  async setTrackingPushcutDestinationEnabled(
    id: string,
    destinationId: string,
    enabled: boolean,
  ): Promise<void> {
    await request(`/v1/offers/${id}/tracking/pushcut-destinations/${destinationId}`, {
      method: 'PATCH',
      body: { enabled },
    });
  },

  async deleteTrackingPushcutDestination(id: string, destinationId: string): Promise<void> {
    await request(`/v1/offers/${id}/tracking/pushcut-destinations/${destinationId}`, {
      method: 'DELETE',
    });
  },

  async testTrackingPushcutDestination(
    id: string,
    destinationId: string,
  ): Promise<{
    accepted: boolean;
    status: number | null;
    response?: { error?: string; [key: string]: unknown };
    error?: string;
  }> {
    return request(`/v1/offers/${id}/tracking/pushcut-destinations/${destinationId}/test`, {
      method: 'POST',
    });
  },

  async listTrackingPushcutDeliveries(id: string): Promise<{
    deliveries: Array<{
      id: string;
      event_id: string;
      event_type: string;
      state: string;
      attempts: number;
      response_status: number | null;
      last_error: string | null;
      created_at: string;
      delivered_at: string | null;
      destination_name: string | null;
      transaction_id: string;
      order_kind: string;
    }>;
  }> {
    return request(`/v1/offers/${id}/tracking/pushcut-deliveries`);
  },

  async retryTrackingPushcutDelivery(id: string, deliveryId: string): Promise<void> {
    await request(`/v1/offers/${id}/tracking/pushcut-deliveries/${deliveryId}/retry`, {
      method: 'POST',
    });
  },

  async resendTrackingPushcutHistory(
    id: string,
  ): Promise<{ orders_scanned: number; destinations: number; notifications_queued: number }> {
    return request(`/v1/offers/${id}/tracking/pushcut-destinations/resend-history`, {
      method: 'POST',
    });
  },

  async recomputeTrackingProductKinds(id: string): Promise<{ updated: number }> {
    return request(`/v1/offers/${id}/tracking/product-kinds/recompute`, { method: 'POST' });
  },

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
      provider: string;
      propagation_param: string;
      enabled: boolean;
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
      tracking_url: string;
      enabled: boolean;
      created_at: string;
      updated_at: string;
    }>;
    vturb: { enabled: boolean; endpoint_url?: string };
    domain_setup: { record_type: 'CNAME'; target: string; note: string };
  }> {
    return request(`/v1/offers/${id}/tracking/advanced`);
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

  async createTrackingAbTest(
    id: string,
    body: {
      name: string;
      kind: 'checkout' | 'presell';
      traffic_a: number;
      variants: Array<{ label: string; gateway?: string; destination_url?: string }>;
    },
  ): Promise<void> {
    await request(`/v1/offers/${id}/tracking/ab-tests`, { method: 'POST', body });
  },

  async createTrackingEntryLink(
    id: string,
    body: { name: string; destination_url: string },
  ): Promise<void> {
    await request(`/v1/offers/${id}/tracking/entry-links`, { method: 'POST', body });
  },

  async deleteTrackingEntryLink(id: string, linkId: string): Promise<void> {
    await request(`/v1/offers/${id}/tracking/entry-links/${linkId}`, { method: 'DELETE' });
  },

  async deleteTrackingAbTest(id: string, testId: string): Promise<void> {
    await request(`/v1/offers/${id}/tracking/ab-tests/${testId}`, { method: 'DELETE' });
  },

  async getTrackingAbTestMetrics(
    id: string,
    testId: string,
  ): Promise<{
    variants: Array<{
      id: string;
      label: string;
      position: number;
      destination_url?: string;
      visitors: number;
      checkouts: number;
      orders: number;
      paid_orders: number;
      revenue_minor: string;
    }>;
  }> {
    return request(`/v1/offers/${id}/tracking/ab-tests/${testId}/metrics`);
  },

  async controlTrackingAbTest(
    id: string,
    testId: string,
    body: { action: 'pause' | 'resume' } | { action: 'select_winner'; variant_id: string },
  ): Promise<void> {
    await request(`/v1/offers/${id}/tracking/ab-tests/${testId}`, {
      method: 'PATCH',
      body,
    });
  },

  async listTrackingEvents(
    id: string,
    page = 1,
    perPage = 25,
    date?: string,
  ): Promise<{
    date: string;
    time_zone: string;
    items: Array<{
      id: string;
      visitor_id: string;
      session_id?: string;
      event_name: string;
      event_url: string;
      page_title?: string;
      referrer?: string;
      source: Record<string, string>;
      client_at?: string;
      received_at: string;
    }>;
    pagination: { page: number; per_page: number; total: number; total_pages: number };
  }> {
    const dateQuery = date ? `&date=${encodeURIComponent(date)}` : '';
    return request(`/v1/offers/${id}/tracking/events?page=${page}&per_page=${perPage}${dateQuery}`);
  },

  async getTrackingPageFunnel(
    id: string,
    date?: string,
  ): Promise<{
    date: string;
    time_zone: string;
    pages: Array<{
      page_url: string;
      page_title: string;
      views: number;
      visitors: number;
      exits: number;
    }>;
  }> {
    const query = date ? `?date=${encodeURIComponent(date)}` : '';
    return request(`/v1/offers/${id}/tracking/page-funnel${query}`);
  },

  async listTrackingJourneys(
    id: string,
    date?: string,
  ): Promise<{
    date: string;
    time_zone: string;
    journeys: Array<{
      visitor_id: string;
      journey_id: string;
      last_seen_at: string;
      pages: Array<{
        id: string;
        title: string;
        url: string;
        referrer?: string;
        visited_at: string;
      }>;
      events: string[];
      order_id?: string;
      order_status?: string;
      buyer?: Record<string, unknown>;
    }>;
  }> {
    const query = date ? `?date=${encodeURIComponent(date)}` : '';
    return request(`/v1/offers/${id}/tracking/journeys${query}`);
  },

  async listTrackingOrders(
    id: string,
    page = 1,
    perPage = 25,
    date?: string,
  ): Promise<{
    date: string;
    time_zone: string;
    items: Array<{
      id: string;
      provider: string;
      external_id: string;
      status: string;
      amount_minor?: string;
      currency?: string;
      visitor_id?: string;
      buyer: Record<string, unknown>;
      raw_status?: string;
      occurred_at: string;
      updated_at: string;
    }>;
    pagination: { page: number; per_page: number; total: number; total_pages: number };
  }> {
    const dateQuery = date ? `&date=${encodeURIComponent(date)}` : '';
    return request(`/v1/offers/${id}/tracking/orders?page=${page}&per_page=${perPage}${dateQuery}`);
  },

  async getTrackingAttribution(
    id: string,
    date?: string,
  ): Promise<{
    date: string;
    time_zone: string;
    rows: Array<{
      source: string;
      campaign_name: string;
      campaign_id?: string;
      adset_name: string;
      adset_id?: string;
      ad_name: string;
      ad_id?: string;
      placement: string;
      ad_clicks: number;
      unique_ad_clicks: number;
      page_views: number;
      visitors: number;
      checkouts: number;
      unique_checkouts: number;
      orders: number;
      paid_orders: number;
      refused_orders: number;
      paid_revenue_minor: string;
    }>;
  }> {
    const query = date ? `?date=${encodeURIComponent(date)}` : '';
    return request(`/v1/offers/${id}/tracking/attribution${query}`);
  },

  async getTrackingCountries(
    id: string,
    date?: string,
  ): Promise<{
    date: string;
    time_zone: string;
    rows: Array<{
      country: string;
      page_views: number;
      checkouts: number;
      orders: number;
      paid_orders: number;
      paid_revenue_minor: string;
    }>;
  }> {
    const query = date ? `?date=${encodeURIComponent(date)}` : '';
    return request(`/v1/offers/${id}/tracking/countries${query}`);
  },

  async listMetaDeliveries(id: string): Promise<{
    deliveries: Array<{
      id: string;
      event_id: string;
      state: 'pending' | 'processing' | 'delivered' | 'failed';
      attempts: number;
      last_error?: string;
      response_status?: number;
      provider_event_count: number;
      created_at: string;
      delivered_at?: string;
      pixel_name: string;
      pixel_id: string;
      transaction_id: string;
      event_name: 'InitiateCheckout' | 'Purchase';
      event_url?: string;
      campaign_id?: string;
      adset_id?: string;
      ad_id?: string;
      has_fbclid: boolean;
      has_fbc: boolean;
      has_fbp: boolean;
    }>;
  }> {
    return request(`/v1/offers/${id}/tracking/meta-deliveries`);
  },

  async reconcileInitiateCheckouts(
    id: string,
    date: string,
  ): Promise<{
    date: string;
    attribution_recovered: number;
    events_found: number;
    pixels_enabled: number;
    utmify_destinations_enabled: number;
    meta_queued: number;
    utmify_queued: number;
  }> {
    return request(
      `/v1/offers/${id}/tracking/initiate-checkout/reconcile?date=${encodeURIComponent(date)}`,
      { method: 'POST' },
    );
  },

  async reconcileMetaPurchases(
    id: string,
  ): Promise<{ orders_found: number; pixels_enabled: number; purchases_queued: number }> {
    return request(`/v1/offers/${id}/tracking/meta-purchases/reconcile`, { method: 'POST' });
  },

  async listMetaPixels(id: string): Promise<{
    pixels: Array<{
      id: string;
      name: string;
      pixel_id: string;
      test_event_code?: string;
      enabled: boolean;
    }>;
  }> {
    return request(`/v1/offers/${id}/tracking/meta-pixels`);
  },

  async saveMetaPixel(
    id: string,
    input: { name: string; pixel_id: string; access_token: string; test_event_code?: string },
  ): Promise<{ verification: 'verified' | 'pending_event_test'; verification_warning?: string }> {
    return request(`/v1/offers/${id}/tracking/meta-pixels`, { method: 'POST', body: input });
  },

  async sendMetaTestEvent(
    id: string,
    pixelId: string,
    eventName: 'InitiateCheckout' | 'Purchase',
  ): Promise<{
    accepted: boolean;
    event_name: string;
    event_id: string;
    events_received: number;
    detail: string;
  }> {
    return request(`/v1/offers/${id}/tracking/meta-pixels/${pixelId}/test-event`, {
      method: 'POST',
      body: { event_name: eventName },
    });
  },

  async updateMetaTestEventCode(id: string, pixelId: string, testEventCode: string): Promise<void> {
    await request(`/v1/offers/${id}/tracking/meta-pixels/${pixelId}/test-event-code`, {
      method: 'PATCH',
      body: { test_event_code: testEventCode },
    });
  },

  async getTrackingUtmifyDestination(id: string): Promise<{
    configured: boolean;
    destination?: {
      id: string;
      name: string;
      endpoint_url: string;
      enabled: boolean;
      updated_at: string;
    } | null;
  }> {
    return request(`/v1/offers/${id}/tracking/utmify-destination`);
  },

  async getTrackingUtmifyPixel(id: string): Promise<{
    configured: boolean;
    pixel_id: string | null;
  }> {
    return request(`/v1/offers/${id}/tracking/utmify-pixel`);
  },

  async saveTrackingUtmifyPixel(
    id: string,
    pixelId: string,
  ): Promise<{ configured: true; pixel_id: string }> {
    return request(`/v1/offers/${id}/tracking/utmify-pixel`, {
      method: 'PUT',
      body: { pixel_id: pixelId },
    });
  },

  async listTrackingUtmifyWebEvents(
    id: string,
    date: string,
  ): Promise<{
    date: string;
    deliveries: Array<{
      id: string;
      event_id: string;
      pixel_id: string;
      state: 'pending' | 'processing' | 'delivered' | 'failed' | 'dead';
      attempts: number;
      response_status?: number;
      last_error?: string;
      created_at: string;
      delivered_at?: string;
      campaign_id?: string;
      adset_id?: string;
      ad_id?: string;
      placement?: string;
      utmify_lead_id?: string;
      utmify_event_id?: string;
    }>;
  }> {
    return request(`/v1/offers/${id}/tracking/utmify-web-events?date=${encodeURIComponent(date)}`);
  },

  async retryTrackingUtmifyWebEvent(id: string, deliveryId: string): Promise<void> {
    await request(`/v1/offers/${id}/tracking/utmify-web-events/${deliveryId}/retry`, {
      method: 'POST',
    });
  },

  async saveTrackingUtmifyDestination(
    id: string,
    input: { name: string; api_token: string; endpoint_url?: string },
  ): Promise<void> {
    await request(`/v1/offers/${id}/tracking/utmify-destination`, {
      method: 'PUT',
      body: input,
    });
  },

  async listTrackingUtmifyDeliveries(id: string): Promise<{
    deliveries: Array<{
      id: string;
      event_id: string;
      event_type: string;
      state: 'pending' | 'processing' | 'delivered' | 'failed' | 'dead';
      attempts: number;
      response_status?: number;
      last_error?: string;
      created_at: string;
      delivered_at?: string;
      transaction_id: string;
      order_status: string;
    }>;
  }> {
    return request(`/v1/offers/${id}/tracking/utmify-deliveries`);
  },

  async retryTrackingUtmifyDelivery(id: string, deliveryId: string): Promise<void> {
    await request(`/v1/offers/${id}/tracking/utmify-deliveries/${deliveryId}/retry`, {
      method: 'POST',
    });
  },

  async reconcileTrackingUtmifyUpsells(
    id: string,
  ): Promise<{ upsells_repaired: number; utmify_queued: number }> {
    return request(`/v1/offers/${id}/tracking/utmify-upsells/reconcile`, { method: 'POST' });
  },

  async sendTrackingUtmifyTestCheckout(id: string): Promise<{
    accepted: boolean;
    delivery_id: string;
    transaction_id: string;
    status: 'waiting_payment';
    is_test: true;
  }> {
    return request(`/v1/offers/${id}/tracking/utmify-test-checkout`, {
      method: 'POST',
    });
  },

  async getOfferAiConfig(id: string): Promise<{
    config: OfferAiConfigView;
    models: Array<{ id: string; label: string }>;
    canManage: boolean;
    canCustomize: boolean;
  }> {
    const wire = await request<{
      config: OfferAiConfigWire;
      models: Array<{ id: string; label: string }>;
      can_manage: boolean;
      can_customize: boolean;
    }>(`/v1/offers/${id}/ai-config`);
    return {
      config: {
        provider: wire.config.provider,
        model: wire.config.model,
        role: wire.config.role,
        template: wire.config.template,
        responsible: wire.config.responsible,
        minRoas: wire.config.min_roas,
        tone: wire.config.tone,
        includeAds: wire.config.include_ads,
        autoGenerate: wire.config.auto_generate,
        scheduleHours: wire.config.schedule_hours,
        apiKeyConfigured: wire.config.api_key_configured,
        apiKeyHint: wire.config.api_key_hint,
      },
      models: wire.models,
      canManage: wire.can_manage,
      canCustomize: wire.can_customize,
    };
  },

  async updateOfferAiConfig(
    id: string,
    input: {
      api_key?: string;
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
    },
  ): Promise<void> {
    await request(`/v1/offers/${id}/ai-config`, { method: 'PUT', body: input });
  },

  async updateOfferAiPreferences(
    id: string,
    input: { model: string; responsible: string },
  ): Promise<void> {
    await request(`/v1/offers/${id}/ai-preferences`, { method: 'PATCH', body: input });
  },

  async generateOfferAiAnalysis(id: string): Promise<OfferAiAnalysisView> {
    await request<{ accepted: true }>(`/v1/offers/${id}/ai-analysis`, { method: 'POST' });

    for (let attempt = 0; attempt < 70; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      const status = await request<{
        status: 'idle' | 'processing' | 'success' | 'error';
        analysisId?: string;
        error?: string;
      }>(`/v1/offers/${id}/ai-analysis-status`);
      if (status.status === 'error') {
        throw new ApiError(status.error || 'Falha ao gerar análise.', 422);
      }
      if (status.status === 'success' && status.analysisId) {
        const analyses = await this.listOfferAiAnalyses(id);
        const analysis = analyses.find((item) => item.id === status.analysisId);
        if (analysis) return analysis;
      }
    }

    throw new ApiError(
      'A análise continua processando. Aguarde alguns instantes e atualize o histórico.',
      408,
    );
  },

  async listOfferAiAnalyses(id: string): Promise<OfferAiAnalysisView[]> {
    const wire = await request<{ analyses: OfferAiAnalysisView[] }>(`/v1/offers/${id}/ai-analyses`);
    return wire.analyses ?? [];
  },

  async updateOfferAiAnalysisFeedback(
    id: string,
    analysisId: string,
    feedback: string,
  ): Promise<OfferAiAnalysisView> {
    return request(`/v1/offers/${id}/ai-analyses/${analysisId}/feedback`, {
      method: 'PATCH',
      body: { feedback },
    });
  },

  async getOfferSnapshots(
    id: string,
    range?: { from?: string; to?: string },
  ): Promise<OfferSnapshotsView> {
    const params = new URLSearchParams();
    if (range?.from) params.set('from', range.from);
    if (range?.to) params.set('to', range.to);
    const qs = params.toString();
    const wire = await request<OfferSnapshotsWire>(
      `/v1/offers/${id}/snapshots${qs ? `?${qs}` : ''}`,
    );
    return fromOfferSnapshotsWire(wire);
  },

  async getDashboardSummary(range?: { from?: string; to?: string }): Promise<DashboardSummary> {
    const params = new URLSearchParams();
    if (range?.from) params.set('from', range.from);
    if (range?.to) params.set('to', range.to);
    const qs = params.toString();
    const wire = await request<DashboardSummaryWire>(`/v1/dashboard/summary${qs ? `?${qs}` : ''}`);
    return fromDashboardSummaryWire(wire);
  },

  async pageDiff(input: {
    url_a: string;
    url_b: string;
    render_mode?: 'static' | 'js';
  }): Promise<{
    url_a: { input: string; final: string; status: number; lines: number };
    url_b: { input: string; final: string; status: number; lines: number };
    render_mode: 'static' | 'js';
    duration_ms: number;
    summary: { added: number; removed: number; unchanged: number };
    entries: Array<{ op: 'equal' | 'add' | 'remove'; text: string }>;
  }> {
    return request('/v1/page-diff', { method: 'POST', body: input });
  },

  async fireWebhook(input: {
    url: string;
    method?: 'POST' | 'PUT' | 'PATCH';
    headers?: Record<string, string>;
    body: unknown;
    timeout_ms?: number;
  }): Promise<{
    ok: boolean;
    status: number;
    duration_ms: number;
    response_headers?: Record<string, string>;
    response_body?: string;
    error?: string;
    sent: { url: string; method: string; headers: Record<string, string>; body: string };
  }> {
    return request('/v1/webhook-test', { method: 'POST', body: input });
  },

  async createVslJob(url: string): Promise<VslJobView> {
    const wire = await request<VslJobWire>('/v1/vsl-jobs', { method: 'POST', body: { url } });
    return fromVslJobWire(wire);
  },

  async getVslJob(id: string, signal?: AbortSignal): Promise<VslJobView> {
    const wire = await request<VslJobWire>(`/v1/vsl-jobs/${id}`, { signal });
    return fromVslJobWire(wire);
  },

  async createClone(input: z.infer<typeof CreateCloneRequestSchema>): Promise<CloneJob> {
    const parsed = CreateCloneRequestSchema.parse(input);
    const body = {
      url: parsed.url,
      ...(parsed.options
        ? {
            options: {
              render_mode: parsed.options.renderMode,
              inline_assets: parsed.options.inlineAssets,
              user_agent: parsed.options.userAgent,
              viewport: parsed.options.viewport,
              link_replacements: parsed.options.linkReplacements,
              keep_script_srcs: parsed.options.keepScriptSrcs,
            },
          }
        : {}),
    };
    const wire = await request<CloneJobWire>('/v1/clones', {
      method: 'POST',
      body,
    });
    return fromCloneJobWire(wire);
  },

  async getClone(id: string, signal?: AbortSignal): Promise<CloneJob> {
    const wire = await request<CloneJobWire>(`/v1/clones/${id}`, { signal });
    return fromCloneJobWire(wire);
  },

  async deleteClone(id: string): Promise<void> {
    await request<void>(`/v1/clones/${id}`, { method: 'DELETE' });
  },

  previewUrl(id: string): string {
    return `${env.NEXT_PUBLIC_API_URL}/v1/clones/${id}/preview`;
  },

  async getCloneForms(
    id: string,
    cursor?: string,
    limit = 200,
    signal?: AbortSignal,
  ): Promise<ListResult<Form>> {
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    if (cursor) params.set('cursor', cursor);
    const wire = await request<PaginatedResponse<FormWire>>(
      `/v1/clones/${id}/forms?${params.toString()}`,
      { signal },
    );
    return {
      data: wire.data.map(fromFormWire),
      nextCursor: wire.pagination.next_cursor,
      limit: wire.pagination.limit,
      totalEstimate: wire.pagination.total_estimate,
    };
  },

  async updateForm(id: string, formId: string, body: UpdateFormRequest): Promise<Form> {
    const wireBody: Record<string, unknown> = {};
    if (body.mode !== undefined) wireBody.mode = body.mode;
    if (body.currentAction !== undefined) wireBody.current_action = body.currentAction;
    if (body.redirectTo !== undefined) wireBody.redirect_to = body.redirectTo;
    const wire = await request<FormWire>(`/v1/clones/${id}/forms/${formId}`, {
      method: 'PATCH',
      body: wireBody,
    });
    return fromFormWire(wire);
  },

  async getCloneLinks(
    id: string,
    cursor?: string,
    limit = 200,
    signal?: AbortSignal,
  ): Promise<ListResult<Link>> {
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    if (cursor) params.set('cursor', cursor);
    const wire = await request<PaginatedResponse<LinkWire>>(
      `/v1/clones/${id}/links?${params.toString()}`,
      { signal },
    );
    return {
      data: wire.data.map(fromLinkWire),
      nextCursor: wire.pagination.next_cursor,
      limit: wire.pagination.limit,
      totalEstimate: wire.pagination.total_estimate,
    };
  },

  async updateLink(id: string, linkId: string, body: UpdateLinkRequest): Promise<Link> {
    const wire = await request<LinkWire>(`/v1/clones/${id}/links/${linkId}`, {
      method: 'PATCH',
      body: { current_href: body.currentHref },
    });
    return fromLinkWire(wire);
  },

  async bulkUpdateLinks(id: string, body: BulkLinkUpdate): Promise<BulkLinkUpdateResult> {
    const wire = await request<{
      matched: number;
      updated: number;
      affected_ids: string[];
    }>(`/v1/clones/${id}/links/bulk`, {
      method: 'POST',
      body: {
        match: body.isRegex ? 'regex' : 'literal',
        from: body.from,
        to: body.to,
      },
    });
    return {
      matched: wire.matched,
      updated: wire.updated,
      affectedIds: wire.affected_ids,
    };
  },

  async createBuild(id: string, opts: BuildOptionsRequest): Promise<BuildJob> {
    const wire = await request<BuildJobWire>(`/v1/clones/${id}/build`, {
      method: 'POST',
      body: {
        format: opts.format,
        include_assets: opts.inlineAssets ?? false,
      },
    });
    return fromBuildJobWire(wire);
  },

  async getBuild(id: string, buildId: string, signal?: AbortSignal): Promise<BuildJob> {
    const wire = await request<BuildJobWire>(`/v1/clones/${id}/builds/${buildId}`, { signal });
    return fromBuildJobWire(wire);
  },

  // ---- Niches (Video Shield) ----
  async listNiches(): Promise<NicheView[]> {
    const wire = await request<{ niches: NicheWire[] }>('/v1/niches');
    return (wire.niches ?? []).map(fromNicheWire);
  },
  async createNiche(input: { name: string; description?: string }): Promise<NicheView> {
    const wire = await request<NicheWire>('/v1/niches', { method: 'POST', body: input });
    return fromNicheWire(wire);
  },
  async updateNiche(
    id: string,
    patch: { name?: string; description?: string },
  ): Promise<NicheView> {
    const wire = await request<NicheWire>(`/v1/niches/${id}`, { method: 'PATCH', body: patch });
    return fromNicheWire(wire);
  },
  async deleteNiche(id: string): Promise<void> {
    await request<void>(`/v1/niches/${id}`, { method: 'DELETE' });
  },
  async addNicheWhite(
    id: string,
    file: File,
    label?: string,
    onProgress?: (pct: number) => void,
  ): Promise<NicheView> {
    const fd = new FormData();
    // Fields BEFORE file — backend reads parts sequentially and stops at the
    // file to stream it. Fields after the file would never be parsed.
    if (label) fd.append('label', label);
    fd.append('file', file);
    const wire = await uploadMultipart<NicheWire>(`/v1/niches/${id}/whites`, fd, onProgress);
    return fromNicheWire(wire);
  },
  async deleteNicheWhite(nicheId: string, whiteId: string): Promise<NicheView> {
    const wire = await request<NicheWire>(`/v1/niches/${nicheId}/whites/${whiteId}`, {
      method: 'DELETE',
    });
    return fromNicheWire(wire);
  },

  // ---- Shield jobs ----
  async createShieldJob(
    args: {
      file: File;
      nicheId: string;
      whiteVolumeDb?: number;
      compression?: ShieldCompressionMode;
      verifyTranscript?: boolean;
    },
    onProgress?: (pct: number) => void,
  ): Promise<ShieldJobView> {
    const fd = new FormData();
    // Fields MUST come before the file — backend stops iterating at the file
    // part to stream it; later fields would never be parsed.
    fd.append('niche_id', args.nicheId);
    if (args.whiteVolumeDb !== undefined) fd.append('white_volume_db', String(args.whiteVolumeDb));
    if (args.compression) fd.append('compression', args.compression);
    if (args.verifyTranscript) fd.append('verify_transcript', '1');
    fd.append('file', args.file);
    const wire = await uploadMultipart<ShieldJobWire>('/v1/shield-jobs', fd, onProgress);
    return fromShieldJobWire(wire);
  },
  async getShieldJob(id: string, signal?: AbortSignal): Promise<ShieldJobView> {
    const wire = await request<ShieldJobWire>(`/v1/shield-jobs/${id}`, { signal });
    return fromShieldJobWire(wire);
  },
  async listShieldJobs(): Promise<ShieldJobView[]> {
    const wire = await request<{ jobs: ShieldJobWire[] }>('/v1/shield-jobs');
    return (wire.jobs ?? []).map(fromShieldJobWire);
  },
  async deleteShieldJob(id: string): Promise<void> {
    await request<void>(`/v1/shield-jobs/${id}`, { method: 'DELETE' });
  },
  /**
   * Baixa um zip com os outputs dos jobs selecionados. Streama do servidor pra
   * blob no browser e dispara download. Limite atual: 100 jobs / chamada.
   */
  async bulkDownloadShieldJobs(ids: string[]): Promise<{ filename: string; bytes: number }> {
    const baseUrl = env.NEXT_PUBLIC_API_URL;
    const token = authToken.get();
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${baseUrl}/v1/shield-jobs/bulk-download`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const j = await res.json();
        msg =
          (j as { detail?: string; message?: string }).detail ??
          (j as { message?: string }).message ??
          msg;
      } catch {}
      throw new ApiError(msg, res.status);
    }
    const blob = await res.blob();
    // Tira nome do header Content-Disposition.
    const cd = res.headers.get('content-disposition') || '';
    const m = cd.match(/filename="([^"]+)"/);
    const filename = m?.[1] ?? `shield-batch-${new Date().toISOString().slice(0, 10)}.zip`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return { filename, bytes: blob.size };
  },

  // ---- Creative Studio ----
  async createMediaJob(
    args: CreateMediaJobInput,
    onProgress?: (pct: number) => void,
  ): Promise<MediaJobView> {
    const fd = new FormData();
    fd.append('compression', args.compression);
    fd.append('aspect_ratio', args.aspectRatio);
    fd.append('strip_metadata', args.stripMetadata ? '1' : '0');
    fd.append('normalize_audio', args.normalizeAudio ? '1' : '0');
    fd.append('extension_mode', args.extensionMode);
    if (args.targetSeconds) fd.append('target_seconds', String(args.targetSeconds));
    fd.append('phase_cancel', args.phaseCancel ? '1' : '0');
    if (args.phaseCancel && args.nicheId) fd.append('niche_id', args.nicheId);
    if (args.phaseCancel && args.whiteVolumeDb !== undefined) {
      fd.append('white_volume_db', String(args.whiteVolumeDb));
    }
    if (args.phaseCancel && args.verifyTranscript) fd.append('verify_transcript', '1');
    fd.append('file', args.file);
    return uploadMultipart<MediaJobView>('/v1/media-jobs', fd, onProgress);
  },
  async listMediaJobs(): Promise<MediaJobView[]> {
    const wire = await request<{ jobs: MediaJobView[] }>('/v1/media-jobs');
    return wire.jobs ?? [];
  },
  async getMediaJob(id: string, signal?: AbortSignal): Promise<MediaJobView> {
    return request<MediaJobView>(`/v1/media-jobs/${id}`, { signal });
  },
  async deleteMediaJob(id: string): Promise<void> {
    await request<void>(`/v1/media-jobs/${id}`, { method: 'DELETE' });
  },
  async bulkDownloadMediaJobs(ids: string[]): Promise<{ filename: string; bytes: number }> {
    const baseUrl = env.NEXT_PUBLIC_API_URL;
    const token = authToken.get();
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${baseUrl}/v1/media-jobs/bulk-download`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) {
      let message = `HTTP ${res.status}`;
      try {
        const body = (await res.json()) as { detail?: string; message?: string };
        message = body.detail ?? body.message ?? message;
      } catch {}
      throw new ApiError(message, res.status);
    }
    const blob = await res.blob();
    const disposition = res.headers.get('content-disposition') || '';
    const filename =
      disposition.match(/filename="([^"]+)"/)?.[1] ??
      `video-studio-${new Date().toISOString().slice(0, 10)}.zip`;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    return { filename, bytes: blob.size };
  },

  // ---- Digistore24 Audits ----
  async listDigiAudits(): Promise<DigiAuditView[]> {
    const wire = await request<{ audits: DigiAuditWire[] }>('/v1/digi-audits');
    return (wire.audits ?? []).map(fromDigiAuditWire);
  },
  async createDigiAudit(input: {
    product_name: string;
    offer_id?: string;
  }): Promise<DigiAuditView> {
    const wire = await request<DigiAuditWire>('/v1/digi-audits', {
      method: 'POST',
      body: input,
    });
    return fromDigiAuditWire(wire);
  },
  async getDigiAudit(id: string, signal?: AbortSignal): Promise<DigiAuditView> {
    const wire = await request<DigiAuditWire>(`/v1/digi-audits/${id}`, { signal });
    return fromDigiAuditWire(wire);
  },
  async updateDigiAudit(
    id: string,
    patch: {
      product_name?: string;
      offer_id?: string;
      status?: DigiAuditStatusView;
      notes?: string;
      items?: Record<string, DigiAuditItemView>;
    },
  ): Promise<DigiAuditView> {
    const wire = await request<DigiAuditWire>(`/v1/digi-audits/${id}`, {
      method: 'PATCH',
      body: patch,
    });
    return fromDigiAuditWire(wire);
  },
  async deleteDigiAudit(id: string): Promise<void> {
    await request<void>(`/v1/digi-audits/${id}`, { method: 'DELETE' });
  },
};

// ---- Digistore24 Audit types ----

export type DigiAuditStatusView = 'draft' | 'in_review' | 'approved' | 'rejected' | 'abandoned';
export type DigiItemStateView = 'pending' | 'done' | 'na';

export interface DigiAuditItemView {
  state: DigiItemStateView;
  notes?: string;
  url?: string;
}

export interface DigiAuditView {
  id: string;
  productName: string;
  offerId?: string;
  status: DigiAuditStatusView;
  items: Record<string, DigiAuditItemView>;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

interface DigiAuditWire {
  id: string;
  product_name: string;
  offer_id?: string;
  status: DigiAuditStatusView;
  items: Record<string, DigiAuditItemView>;
  notes?: string;
  created_at: string;
  updated_at: string;
}

function fromDigiAuditWire(w: DigiAuditWire): DigiAuditView {
  return {
    id: w.id,
    productName: w.product_name,
    offerId: w.offer_id,
    status: w.status,
    items: w.items ?? {},
    notes: w.notes,
    createdAt: w.created_at,
    updatedAt: w.updated_at,
  };
}

// ---- Shield / Niche types ----

export interface NicheWhiteView {
  id: string;
  filename: string;
  bytes: number;
  label?: string;
  createdAt: string;
}

export interface NicheView {
  id: string;
  name: string;
  description?: string;
  whites: NicheWhiteView[];
  createdAt: string;
  updatedAt?: string;
  /** userId do criador. Útil pra mostrar "criado por…" no UI. */
  createdBy?: string;
  /** Servidor calcula: true se o usuário logado é admin OU criou o nicho. */
  canModify: boolean;
}

interface NicheWhiteWire {
  id: string;
  filename: string;
  bytes: number;
  label?: string;
  created_at: string;
}

interface NicheWire {
  id: string;
  name: string;
  description?: string;
  whites: NicheWhiteWire[];
  created_at: string;
  updated_at?: string;
  created_by?: string;
  can_modify?: boolean;
}

function fromNicheWhiteWire(w: NicheWhiteWire): NicheWhiteView {
  return {
    id: w.id,
    filename: w.filename,
    bytes: w.bytes,
    label: w.label,
    createdAt: w.created_at,
  };
}

function fromNicheWire(w: NicheWire): NicheView {
  return {
    id: w.id,
    name: w.name,
    description: w.description,
    whites: (w.whites ?? []).map(fromNicheWhiteWire),
    createdAt: w.created_at,
    updatedAt: w.updated_at,
    createdBy: w.created_by,
    // Default true por defensividade — backend antigo (sem o campo) trata como modificável.
    canModify: w.can_modify ?? true,
  };
}

export type ShieldCompressionMode = 'none' | 'lossless' | 'balanced' | 'small';
export type ShieldJobStatusView = 'queued' | 'processing' | 'verifying' | 'ready' | 'failed';
export type ShieldVerifyStatusView = 'pending' | 'done' | 'failed' | 'skipped';

export interface ShieldJobView {
  id: string;
  status: ShieldJobStatusView;
  niche: { id: string; name: string };
  white: { id: string; label: string; volumeDb: number };
  compression: ShieldCompressionMode;
  verifyTranscript: boolean;
  input: { filename: string; bytes: number };
  output?: { filename: string; bytes: number; downloadUrl?: string };
  transcript?: string;
  transcriptStatus?: ShieldVerifyStatusView;
  transcriptError?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export type MediaCompressionMode = 'none' | 'balanced' | 'small';
export type MediaAspectRatio = 'original' | '9:16' | '4:5' | '1:1';
export type MediaExtensionMode = 'none' | 'loop' | 'freeze';

export interface CreateMediaJobInput {
  file: File;
  compression: MediaCompressionMode;
  aspectRatio: MediaAspectRatio;
  stripMetadata: boolean;
  normalizeAudio: boolean;
  extensionMode: MediaExtensionMode;
  targetSeconds?: number;
  phaseCancel: boolean;
  nicheId?: string;
  whiteVolumeDb?: number;
  verifyTranscript?: boolean;
}

export interface MediaJobView {
  id: string;
  status: 'queued' | 'processing' | 'verifying' | 'ready' | 'failed';
  input: { filename: string; bytes: number };
  options: {
    compression: MediaCompressionMode;
    aspect_ratio: MediaAspectRatio;
    strip_metadata: boolean;
    normalize_audio: boolean;
    extension_mode: MediaExtensionMode;
    target_seconds?: number;
    phase_cancel: boolean;
    niche?: { id: string; name?: string };
    white?: { id: string; label?: string; volume_db?: number };
    verify_transcript: boolean;
  };
  output?: { filename: string; bytes?: number; download_url?: string };
  transcript?: string;
  transcript_status?: ShieldVerifyStatusView;
  transcript_error?: string;
  error?: string;
  created_at: string;
  updated_at: string;
}

interface ShieldJobWire {
  id: string;
  status: ShieldJobStatusView;
  niche: { id: string; name: string };
  white: { id: string; label: string; volume_db: number };
  compression: ShieldCompressionMode;
  verify_transcript: boolean;
  input: { filename: string; bytes: number };
  output?: { filename: string; bytes: number; download_url?: string };
  transcript?: string;
  transcript_status?: ShieldVerifyStatusView;
  transcript_error?: string;
  error?: string;
  created_at: string;
  updated_at: string;
}

function fromShieldJobWire(w: ShieldJobWire): ShieldJobView {
  return {
    id: w.id,
    status: w.status,
    niche: w.niche,
    white: { id: w.white.id, label: w.white.label, volumeDb: w.white.volume_db },
    compression: w.compression,
    verifyTranscript: w.verify_transcript,
    input: w.input,
    output: w.output
      ? {
          filename: w.output.filename,
          bytes: w.output.bytes,
          downloadUrl: w.output.download_url,
        }
      : undefined,
    transcript: w.transcript,
    transcriptStatus: w.transcript_status,
    transcriptError: w.transcript_error,
    error: w.error,
    createdAt: w.created_at,
    updatedAt: w.updated_at,
  };
}

/**
 * XHR-based multipart upload — gives us progress events that fetch() can't.
 * Used for video uploads (potentially up to 100MB).
 */
function uploadMultipart<T>(
  path: string,
  body: FormData,
  onProgress?: (pct: number) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const baseUrl = env.NEXT_PUBLIC_API_URL;
    xhr.open('POST', `${baseUrl}${path}`);
    xhr.timeout = 20 * 60 * 1000;
    const token = authToken.get();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.responseType = 'json';
    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.response as T);
      } else {
        const r = (xhr.response ?? {}) as { detail?: string; message?: string };
        const msg = r.detail || r.message || `HTTP ${xhr.status}`;
        reject(new ApiError(msg, xhr.status, r));
      }
    };
    xhr.onerror = () => reject(new ApiError('Falha de rede no upload.', 0));
    xhr.ontimeout = () =>
      reject(
        new ApiError(
          'O upload excedeu 20 minutos. Verifique a conexão e tente novamente com menos vídeos.',
          0,
        ),
      );
    xhr.send(body);
  });
}

export { ApiError };
