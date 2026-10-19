import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type { Redis } from 'ioredis';
import { ConflictError, NotFoundError } from '../lib/problem.js';
import {
  AI_CONFIG_PREFIX,
  AI_HISTORY_PREFIX,
  AI_PREFERENCES_PREFIX,
  OPENCODE_GO_MODEL_IDS,
  type OfferAiAnalysisRecord,
  type OfferAiPublicConfig,
  type OfferAiSecretConfig,
  type OfferAiUserPreferences,
} from './offer-store-data.js';

export class OfferAiStore {
  private readonly encryptionKey: Buffer;
  constructor(
    protected readonly redis: Redis,
    encryptionSecret: string,
  ) {
    this.encryptionKey = createHash('sha256').update(encryptionSecret).digest();
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

  private aiConfigKey(id: string): string {
    return `${AI_CONFIG_PREFIX}${id}`;
  }

  private aiHistoryKey(id: string): string {
    return `${AI_HISTORY_PREFIX}${id}`;
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

  protected encrypt(plainText: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.');
  }

  protected decrypt(payload: string): string {
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
}
