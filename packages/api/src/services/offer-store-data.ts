import type { Offer, OfferStatus } from '@page-cloner/shared';

export const OFFER_PREFIX = 'offer:';
// {id} → hash
export const USER_OFFERS_PREFIX = 'user-offers:';
// {userId} → set of offer ids
export const CREDENTIAL_PREFIX = 'offer-utmify:';

export const AI_CONFIG_PREFIX = 'offer-ai-config:';

export const AI_HISTORY_PREFIX = 'offer-ai-history:';

export const AI_PREFERENCES_PREFIX = 'offer-ai-preferences:';

export const OPENCODE_GO_MODEL_IDS = new Set([
  'deepseek-v4-flash',
  'deepseek-v4-pro',
  'kimi-k2.6',
  'kimi-k2.7-code',
  'kimi-k3',
  'glm-5.2',
  'grok-4.5',
  'mimo-v2.5',
]);

export interface UtmifyCredentials {
  login: string;
  password: string;
}

export interface OfferAiSecretConfig {
  apiKey: string;
  provider: 'opencode-go';
  model: string;
  role: string;
  template: string;
  responsible: string;
  minRoas: number;
  tone: 'direto' | 'conservador' | 'detalhado';
  includeAds: boolean;
  autoGenerate: boolean;
  scheduleHours: number[];
}

export type OfferAiPublicConfig = Omit<OfferAiSecretConfig, 'apiKey'> & {
  apiKeyConfigured: boolean;
  apiKeyHint?: string;
};

export interface OfferAiAnalysisRecord {
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

export interface OfferAiUserPreferences {
  model: string;
  responsible: string;
}

export const VALID_STATUSES: OfferStatus[] = [
  'testando',
  'validando',
  'escala',
  'pausado',
  'morrendo',
];

export function isValidStatus(s: unknown): s is OfferStatus {
  return typeof s === 'string' && VALID_STATUSES.includes(s as OfferStatus);
}

export function parseMemberIds(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? [
          ...new Set(
            parsed.filter((item): item is string => typeof item === 'string' && item.length > 0),
          ),
        ]
      : [];
  } catch {
    return [];
  }
}

export function maskLogin(login: string): string {
  const [name, domain] = login.split('@');
  if (!domain) return `${login.slice(0, 2)}***`;
  return `${(name ?? '').slice(0, 2)}***@${domain}`;
}

export function serialize(offer: Offer): Record<string, string> {
  const out: Record<string, string> = {
    id: offer.id,
    userId: offer.userId,
    name: offer.name,
    status: offer.status,
    createdAt: offer.createdAt,
  };
  if (offer.companyName) out.companyName = offer.companyName;
  if (offer.memberIds && offer.memberIds.length > 0) {
    out.memberIds = JSON.stringify(offer.memberIds);
  }
  if (offer.dashboardId) out.dashboardId = offer.dashboardId;
  if (offer.currency) out.currency = offer.currency;
  if (offer.description) out.description = offer.description;
  if (offer.utmifyConfigured) out.utmifyConfigured = 'true';
  if (offer.utmifyAccessEnabled !== undefined)
    out.utmifyAccessEnabled = String(offer.utmifyAccessEnabled);
  if (offer.utmifyLoginHint) out.utmifyLoginHint = offer.utmifyLoginHint;
  if (offer.syncStatus) out.syncStatus = offer.syncStatus;
  if (offer.lastSyncAt) out.lastSyncAt = offer.lastSyncAt;
  if (offer.lastSyncError) out.lastSyncError = offer.lastSyncError;
  if (offer.updatedAt) out.updatedAt = offer.updatedAt;
  return out;
}

export function deserialize(data: Record<string, string>): Offer {
  const status = isValidStatus(data.status) ? data.status : 'testando';
  return {
    id: data.id ?? '',
    userId: data.userId ?? '',
    name: data.name ?? '',
    ...(data.memberIds ? { memberIds: parseMemberIds(data.memberIds) } : {}),
    ...(data.companyName ? { companyName: data.companyName } : {}),
    ...(data.dashboardId ? { dashboardId: data.dashboardId } : {}),
    ...(data.currency ? { currency: data.currency } : {}),
    ...(data.description ? { description: data.description } : {}),
    ...(data.utmifyConfigured === 'true' ? { utmifyConfigured: true } : {}),
    ...(data.utmifyAccessEnabled !== undefined
      ? { utmifyAccessEnabled: data.utmifyAccessEnabled === 'true' }
      : {}),
    ...(data.utmifyLoginHint ? { utmifyLoginHint: data.utmifyLoginHint } : {}),
    ...(data.syncStatus === 'idle' ||
    data.syncStatus === 'syncing' ||
    data.syncStatus === 'success' ||
    data.syncStatus === 'partial' ||
    data.syncStatus === 'error'
      ? { syncStatus: data.syncStatus }
      : {}),
    ...(data.lastSyncAt ? { lastSyncAt: data.lastSyncAt } : {}),
    ...(data.lastSyncError ? { lastSyncError: data.lastSyncError } : {}),
    status,
    createdAt: data.createdAt ?? '',
    ...(data.updatedAt ? { updatedAt: data.updatedAt } : {}),
  };
}
