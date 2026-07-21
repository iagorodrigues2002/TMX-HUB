import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type { Offer, OfferStatus, UpdateOfferRequest } from '@page-cloner/shared';
import type { Redis } from 'ioredis';
import { ulid } from 'ulid';
import { ConflictError, NotFoundError } from '../lib/problem.js';

const OFFER_PREFIX = 'offer:'; // {id} → hash
const USER_OFFERS_PREFIX = 'user-offers:'; // {userId} → set of offer ids
const CREDENTIAL_PREFIX = 'offer-utmify:';

export interface UtmifyCredentials {
  login: string;
  password: string;
}

const VALID_STATUSES: OfferStatus[] = ['testando', 'validando', 'escala', 'pausado', 'morrendo'];

function isValidStatus(s: unknown): s is OfferStatus {
  return typeof s === 'string' && VALID_STATUSES.includes(s as OfferStatus);
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

  async delete(id: string, userId: string): Promise<void> {
    await this.redis
      .multi()
      .del(this.key(id))
      .del(this.credentialKey(id))
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

  async setSyncState(
    id: string,
    state: { status: 'idle' | 'syncing' | 'success' | 'error'; at?: string; error?: string },
  ): Promise<void> {
    const values: Record<string, string> = { syncStatus: state.status };
    if (state.at) values.lastSyncAt = state.at;
    if (state.error) values.lastSyncError = state.error.slice(0, 500);
    const tx = this.redis.multi().hset(this.key(id), values);
    if (!state.error) tx.hdel(this.key(id), 'lastSyncError');
    await tx.exec();
  }

  /** Verify the offer exists AND belongs to the given user. Throws otherwise. */
  async assertOwner(id: string, userId: string): Promise<Offer> {
    const offer = await this.get(id);
    if (offer.userId !== userId) {
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
    if (offer.dashboardId) out.dashboardId = offer.dashboardId;
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
      ...(data.companyName ? { companyName: data.companyName } : {}),
      ...(data.dashboardId ? { dashboardId: data.dashboardId } : {}),
      ...(data.description ? { description: data.description } : {}),
      ...(data.utmifyConfigured === 'true' ? { utmifyConfigured: true } : {}),
      ...(data.utmifyLoginHint ? { utmifyLoginHint: data.utmifyLoginHint } : {}),
      ...(data.syncStatus === 'idle' ||
      data.syncStatus === 'syncing' ||
      data.syncStatus === 'success' ||
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
}

function maskLogin(login: string): string {
  const [name, domain] = login.split('@');
  if (!domain) return `${login.slice(0, 2)}***`;
  return `${(name ?? '').slice(0, 2)}***@${domain}`;
}
