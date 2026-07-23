import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type { Offer, OfferStatus, UpdateOfferRequest } from '@page-cloner/shared';
import type { Redis } from 'ioredis';
import { ulid } from 'ulid';
import { ConflictError, NotFoundError } from '../lib/problem.js';

const OFFER_PREFIX = 'offer:'; // {id} → hash
const USER_OFFERS_PREFIX = 'user-offers:'; // {userId} → set of offer ids
const CREDENTIAL_PREFIX = 'offer-utmify:';
const AI_CONFIG_PREFIX = 'offer-ai-config:';
const AI_HISTORY_PREFIX = 'offer-ai-history:';
const AI_PREFERENCES_PREFIX = 'offer-ai-preferences:';
const OPENCODE_GO_MODEL_IDS = new Set([
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

const VALID_STATUSES: OfferStatus[] = ['testando', 'validando', 'escala', 'pausado', 'morrendo'];

function isValidStatus(s: unknown): s is OfferStatus {
  return typeof s === 'string' && VALID_STATUSES.includes(s as OfferStatus);
}

export function canAccessOffer(offer: Offer, userId: string, isAdmin = false): boolean {
  return isAdmin || offer.userId === userId || Boolean(offer.memberIds?.includes(userId));
}

export function canManageOffer(offer: Offer, userId: string, isAdmin = false): boolean {
  return isAdmin || offer.userId === userId;
}

export class OfferStore {
  private readonly encryptionKey: Buffer;

  constructor(
    private readonly redis: Redis,
    encryptionSecret: string,
  ) {
    this.encryptionKey = createHash('sha256').update(encryptionSecret).digest();
  }

  async create(args: {
    userId: string;
    name: string;
    companyName?: string;
    dashboardId?: string;
    description?: string;
    status?: OfferStatus;
    memberIds?: string[];
  }): Promise<Offer> {
    // Disallow duplicate names per user — keeps URLs predictable.
    const existing = await this.listByUser(args.userId);
    if (existing.some((o) => o.name.toLowerCase() === args.name.trim().toLowerCase())) {
      throw new ConflictError(`Já existe uma oferta chamada "${args.name}".`);
    }
    const offer: Offer = {
      id: ulid(),
      userId: args.userId,
      name: args.name.trim(),
      ...(args.memberIds && args.memberIds.length > 0
        ? { memberIds: [...new Set(args.memberIds)] }
        : {}),
      ...(args.companyName ? { companyName: args.companyName.trim() } : {}),
      ...(args.dashboardId ? { dashboardId: args.dashboardId.trim() } : {}),
      ...(args.description ? { description: args.description.trim() } : {}),
      status: args.status ?? 'testando',
      createdAt: new Date().toISOString(),
    };
    await this.redis
      .multi()
      .hset(this.key(offer.id), this.serialize(offer))
      .sadd(this.userKey(args.userId), offer.id)
      .exec();
    return offer;
  }

  async update(id: string, userId: string, patch: UpdateOfferRequest): Promise<Offer> {
    const current = await this.assertOwner(id, userId);

    // Name conflicts (only when changing name).
    if (patch.name && patch.name.trim().toLowerCase() !== current.name.toLowerCase()) {
      const all = await this.listByUser(userId);
      if (
        all.some((o) => o.id !== id && o.name.toLowerCase() === patch.name!.trim().toLowerCase())
      ) {
        throw new ConflictError(`Já existe uma oferta chamada "${patch.name}".`);
      }
    }

    const next: Offer = {
      ...current,
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.company_name !== undefined
        ? { companyName: patch.company_name.trim() || undefined }
        : {}),
      ...(patch.dashboard_id !== undefined
        ? { dashboardId: patch.dashboard_id.trim() || undefined }
        : {}),
      ...(patch.description !== undefined
        ? { description: patch.description.trim() || undefined }
        : {}),
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.member_ids !== undefined
        ? {
            memberIds: [...new Set(patch.member_ids)].filter(
              (memberId) => memberId !== current.userId,
            ),
          }
        : {}),
      updatedAt: new Date().toISOString(),
    };

    // Re-write the whole hash so removed optional fields actually disappear.
    await this.redis.multi().del(this.key(id)).hset(this.key(id), this.serialize(next)).exec();
    return next;
  }

  async get(id: string): Promise<Offer> {
    const data = await this.redis.hgetall(this.key(id));
    if (!data || Object.keys(data).length === 0) {
      throw new NotFoundError(`Oferta não encontrada: ${id}`);
    }
    return this.deserialize(data);
  }

  async maybeGet(id: string): Promise<Offer | null> {
    try {
      return await this.get(id);
    } catch {
      return null;
    }
  }

  async listByUser(userId: string): Promise<Offer[]> {
    const ids = await this.redis.smembers(this.userKey(userId));
    if (ids.length === 0) return [];
    const pipeline = this.redis.pipeline();
    for (const id of ids) pipeline.hgetall(this.key(id));
    const results = (await pipeline.exec()) ?? [];
    const offers: Offer[] = [];
    for (const [, data] of results) {
      if (!data || typeof data !== 'object') continue;
      const rec = data as Record<string, string>;
      if (!rec.id) continue;
      offers.push(this.deserialize(rec));
    }
    return offers.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async listAccessible(userId: string, isAdmin = false): Promise<Offer[]> {
    const offers = await this.listAll();
    return offers
      .filter((offer) => canAccessOffer(offer, userId, isAdmin))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async removeMemberFromAll(memberId: string): Promise<void> {
    const offers = await this.listAll();
    for (const offer of offers) {
      if (!offer.memberIds?.includes(memberId)) continue;
      const memberIds = offer.memberIds.filter((id) => id !== memberId);
      const tx = this.redis.multi();
      if (memberIds.length > 0) {
        tx.hset(this.key(offer.id), {
          memberIds: JSON.stringify(memberIds),
          updatedAt: new Date().toISOString(),
        });
      } else {
        tx.hdel(this.key(offer.id), 'memberIds');
        tx.hset(this.key(offer.id), 'updatedAt', new Date().toISOString());
      }
      await tx.exec();
    }
  }

  async delete(id: string, userId: string): Promise<void> {
    await this.redis
      .multi()
      .del(this.key(id))
      .del(this.credentialKey(id))
      .del(this.aiConfigKey(id))
      .del(this.aiHistoryKey(id))
      .srem(this.userKey(userId), id)
      .exec();
  }

  async listAll(): Promise<Offer[]> {
    let cursor = '0';
    const offers: Offer[] = [];
    do {
      const [next, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        `${OFFER_PREFIX}*`,
        'COUNT',
        '200',
      );
      cursor = next;
      if (keys.length > 0) {
        const pipeline = this.redis.pipeline();
        for (const offerKey of keys) pipeline.hgetall(offerKey);
        for (const [, value] of (await pipeline.exec()) ?? []) {
          const data = value as Record<string, string> | null;
          if (data?.id) offers.push(this.deserialize(data));
        }
      }
    } while (cursor !== '0');
    return offers;
  }

  async setUtmifyCredentials(id: string, credentials: UtmifyCredentials): Promise<void> {
    await this.redis.set(this.credentialKey(id), this.encrypt(JSON.stringify(credentials)));
    await this.redis.hset(this.key(id), {
      utmifyConfigured: 'true',
      utmifyLoginHint: maskLogin(credentials.login),
      syncStatus: 'idle',
      updatedAt: new Date().toISOString(),
    });
  }

  async getUtmifyCredentials(id: string): Promise<UtmifyCredentials | null> {
    const encrypted = await this.redis.get(this.credentialKey(id));
    if (!encrypted) return null;
    try {
      const parsed = JSON.parse(this.decrypt(encrypted)) as Partial<UtmifyCredentials>;
      return parsed.login && parsed.password
        ? { login: parsed.login, password: parsed.password }
        : null;
    } catch {
      return null;
    }
  }

  async setAiConfig(
    id: string,
    config: Omit<OfferAiSecretConfig, 'apiKey'> & { apiKey?: string },
  ): Promise<OfferAiPublicConfig> {
    const current = await this.getAiSecretConfig(id);
    const apiKey = config.apiKey?.trim() || current?.apiKey;
    if (!apiKey) {
      throw new ConflictError('Informe uma chave de API do OpenCode Go.');
    }
    const next: OfferAiSecretConfig = { ...config, apiKey };
    await this.redis.set(this.aiConfigKey(id), this.encrypt(JSON.stringify(next)));
    return this.toPublicAiConfig(next);
  }

  async getAiConfig(id: string): Promise<OfferAiPublicConfig | null> {
    const config = await this.getAiSecretConfig(id);
    return config ? this.toPublicAiConfig(config) : null;
  }

  async getAiUserPreferences(
    offerId: string,
    userId: string,
  ): Promise<OfferAiUserPreferences | null> {
    const raw = await this.redis.get(`${AI_PREFERENCES_PREFIX}${offerId}:${userId}`);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Partial<OfferAiUserPreferences>;
      if (!parsed.model || typeof parsed.responsible !== 'string') return null;
      return { model: parsed.model, responsible: parsed.responsible };
    } catch {
      return null;
    }
  }

  async setAiUserPreferences(
    offerId: string,
    userId: string,
    preferences: OfferAiUserPreferences,
  ): Promise<OfferAiUserPreferences> {
    await this.redis.set(
      `${AI_PREFERENCES_PREFIX}${offerId}:${userId}`,
      JSON.stringify(preferences),
    );
    return preferences;
  }

  async getAiSecretConfig(id: string): Promise<OfferAiSecretConfig | null> {
    const encrypted = await this.redis.get(this.aiConfigKey(id));
    if (!encrypted) return null;
    try {
      const parsed = JSON.parse(this.decrypt(encrypted)) as Partial<
        Omit<OfferAiSecretConfig, 'provider'>
      > & { provider?: 'opencode-go' | 'opencode-zen' };
      if (
        !parsed.apiKey ||
        (parsed.provider !== 'opencode-go' && parsed.provider !== 'opencode-zen') ||
        !parsed.model ||
        !parsed.role ||
        !parsed.template
      ) {
        return null;
      }
      return {
        apiKey: parsed.apiKey,
        provider: 'opencode-go',
        model: OPENCODE_GO_MODEL_IDS.has(parsed.model) ? parsed.model : 'deepseek-v4-flash',
        role: parsed.role,
        template: parsed.template,
        responsible: parsed.responsible ?? '',
        minRoas: Number.isFinite(parsed.minRoas) ? (parsed.minRoas ?? 0) : 0,
        tone: parsed.tone ?? 'direto',
        includeAds: parsed.includeAds ?? true,
        autoGenerate: parsed.autoGenerate ?? false,
        scheduleHours: Array.isArray(parsed.scheduleHours)
          ? parsed.scheduleHours.filter(
              (hour): hour is number => Number.isInteger(hour) && hour >= 0 && hour <= 23,
            )
          : [],
      };
    } catch {
      return null;
    }
  }

  async addAiAnalysis(record: OfferAiAnalysisRecord): Promise<void> {
    await this.redis
      .multi()
      .lpush(this.aiHistoryKey(record.offerId), JSON.stringify(record))
      .ltrim(this.aiHistoryKey(record.offerId), 0, 29)
      .expire(this.aiHistoryKey(record.offerId), 180 * 24 * 60 * 60)
      .exec();
  }

  async listAiAnalyses(offerId: string): Promise<OfferAiAnalysisRecord[]> {
    const values = await this.redis.lrange(this.aiHistoryKey(offerId), 0, 29);
    return values.flatMap((value) => {
      try {
        return [JSON.parse(value) as OfferAiAnalysisRecord];
      } catch {
        return [];
      }
    });
  }

  async setAiAnalysisFeedback(
    offerId: string,
    analysisId: string,
    feedback: string,
  ): Promise<OfferAiAnalysisRecord> {
    const records = await this.listAiAnalyses(offerId);
    const index = records.findIndex((record) => record.id === analysisId);
    const existing = records[index];
    if (!existing) throw new NotFoundError('Análise de IA não encontrada.');

    const updated: OfferAiAnalysisRecord = {
      ...existing,
      feedback: feedback.trim() || undefined,
    };
    records[index] = updated;
    const key = this.aiHistoryKey(offerId);
    const tx = this.redis.multi().del(key);
    if (records.length > 0) tx.rpush(key, ...records.map((record) => JSON.stringify(record)));
    tx.expire(key, 180 * 24 * 60 * 60);
    await tx.exec();
    return updated;
  }

  async setSyncState(
    id: string,
    state: {
      status: 'idle' | 'syncing' | 'success' | 'partial' | 'error';
      at?: string;
      error?: string;
    },
  ): Promise<void> {
    const values: Record<string, string> = { syncStatus: state.status };
    if (state.at) values.lastSyncAt = state.at;
    if (state.error) values.lastSyncError = state.error.slice(0, 500);
    const tx = this.redis.multi().hset(this.key(id), values);
    if (!state.error) tx.hdel(this.key(id), 'lastSyncError');
    await tx.exec();
  }

  async setCurrency(id: string, currency: string): Promise<void> {
    await this.redis.hset(this.key(id), {
      currency: currency.toUpperCase(),
      updatedAt: new Date().toISOString(),
    });
  }

  /** Verify the offer exists AND belongs to the given user. Throws otherwise. */
  async assertOwner(id: string, userId: string): Promise<Offer> {
    const offer = await this.get(id);
    if (offer.userId !== userId) {
      throw new NotFoundError(`Oferta não encontrada: ${id}`);
    }
    return offer;
  }

  async assertManager(id: string, userId: string, isAdmin = false): Promise<Offer> {
    const offer = await this.get(id);
    if (!canManageOffer(offer, userId, isAdmin)) {
      throw new NotFoundError(`Oferta não encontrada: ${id}`);
    }
    return offer;
  }

  async assertAccess(id: string, userId: string, isAdmin = false): Promise<Offer> {
    const offer = await this.get(id);
    if (!canAccessOffer(offer, userId, isAdmin)) {
      throw new NotFoundError(`Oferta não encontrada: ${id}`);
    }
    return offer;
  }

  private key(id: string): string {
    return `${OFFER_PREFIX}${id}`;
  }
  private userKey(userId: string): string {
    return `${USER_OFFERS_PREFIX}${userId}`;
  }
  private credentialKey(id: string): string {
    return `${CREDENTIAL_PREFIX}${id}`;
  }
  private aiConfigKey(id: string): string {
    return `${AI_CONFIG_PREFIX}${id}`;
  }
  private aiHistoryKey(id: string): string {
    return `${AI_HISTORY_PREFIX}${id}`;
  }

  private encrypt(plainText: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.');
  }

  private decrypt(payload: string): string {
    const [ivRaw, tagRaw, encryptedRaw] = payload.split('.');
    if (!ivRaw || !tagRaw || !encryptedRaw) throw new Error('Invalid encrypted credential.');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey,
      Buffer.from(ivRaw, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedRaw, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }

  private serialize(offer: Offer): Record<string, string> {
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
    if (offer.utmifyLoginHint) out.utmifyLoginHint = offer.utmifyLoginHint;
    if (offer.syncStatus) out.syncStatus = offer.syncStatus;
    if (offer.lastSyncAt) out.lastSyncAt = offer.lastSyncAt;
    if (offer.lastSyncError) out.lastSyncError = offer.lastSyncError;
    if (offer.updatedAt) out.updatedAt = offer.updatedAt;
    return out;
  }

  private deserialize(data: Record<string, string>): Offer {
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

  private toPublicAiConfig(config: OfferAiSecretConfig): OfferAiPublicConfig {
    return {
      provider: config.provider,
      model: config.model,
      role: config.role,
      template: config.template,
      responsible: config.responsible,
      minRoas: config.minRoas,
      tone: config.tone,
      includeAds: config.includeAds,
      autoGenerate: config.autoGenerate,
      scheduleHours: config.scheduleHours,
      apiKeyConfigured: true,
      apiKeyHint: `${config.apiKey.slice(0, 5)}••••${config.apiKey.slice(-4)}`,
    };
  }
}

function parseMemberIds(value: string): string[] {
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

function maskLogin(login: string): string {
  const [name, domain] = login.split('@');
  if (!domain) return `${login.slice(0, 2)}***`;
  return `${(name ?? '').slice(0, 2)}***@${domain}`;
}
