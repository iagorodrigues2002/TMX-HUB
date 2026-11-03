import type { Offer, OfferStatus, UpdateOfferRequest } from '@page-cloner/shared';
import type { Redis } from 'ioredis';
import type { Sql } from 'postgres';
import { ulid } from 'ulid';
import { ConflictError, HttpProblem, NotFoundError } from '../lib/problem.js';
import { OfferAiStore } from './offer-ai-store.js';
import {
  AI_CONFIG_PREFIX,
  AI_HISTORY_PREFIX,
  CREDENTIAL_PREFIX,
  OFFER_PREFIX,
  USER_OFFERS_PREFIX,
  type UtmifyCredentials,
  deserialize,
  maskLogin,
  serialize,
} from './offer-store-data.js';

export function canAccessOffer(offer: Offer, userId: string, isAdmin = false): boolean {
  // Legacy sharing records are retained for audit, not authorization. Only the
  // owning account and global administrators may cross the offer boundary.
  return isAdmin || offer.userId === userId;
}

export function canManageOffer(offer: Offer, userId: string, isAdmin = false): boolean {
  return isAdmin || offer.userId === userId;
}

export type OfferMemberRole = 'owner' | 'tracking_manager' | 'member';

export function canConfigureTrackingOffer(
  offer: Offer,
  userId: string,
  isAdmin = false,
  _memberRole: OfferMemberRole = 'member',
): boolean {
  return canAccessOffer(offer, userId, isAdmin);
}

export class OfferStore extends OfferAiStore {
  constructor(
    redis: Redis,
    encryptionSecret: string,
    private readonly db: Sql | null = null,
  ) {
    super(redis, encryptionSecret);
  }

  async create(args: {
    userId: string;
    name: string;
    companyName?: string;
    companyId?: string;
    isAdmin?: boolean;
    dashboardId?: string;
    utmifyAccessEnabled?: boolean;
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
      ...(args.utmifyAccessEnabled !== undefined
        ? { utmifyAccessEnabled: args.utmifyAccessEnabled }
        : {}),
      ...(args.memberIds && args.memberIds.length > 0
        ? { memberIds: [...new Set(args.memberIds)] }
        : {}),
      ...(args.companyName ? { companyName: args.companyName.trim() } : {}),
      ...(args.dashboardId ? { dashboardId: args.dashboardId.trim() } : {}),
      ...(args.description ? { description: args.description.trim() } : {}),
      status: args.status ?? 'testando',
      createdAt: new Date().toISOString(),
    };
    if (this.db) {
      await this.db.begin(async (sql) => {
        if (!args.companyId) {
          throw new HttpProblem({
            status: 403,
            title: 'Forbidden',
            detail: 'Selecione a empresa da oferta.',
          });
        }
        const [company] =
          await sql`SELECT id,name FROM companies WHERE id=${args.companyId} FOR UPDATE`;
        if (!company) throw new NotFoundError('Empresa não encontrada.');
        const [membership] =
          await sql`SELECT role,status FROM company_memberships WHERE company_id=${args.companyId} AND user_id=${args.userId}`;
        if (
          !args.isAdmin &&
          (!membership ||
            membership.status !== 'active' ||
            !['owner', 'admin'].includes(membership.role))
        )
          throw new HttpProblem({
            status: 403,
            title: 'Forbidden',
            detail: 'Sem permissão para criar ofertas nesta empresa.',
          });
        offer.companyName = company.name;
        // Commit the boundary before Redis: a failed write may leave a harmless binding,
        // but must never leave a visible company offer with legacy authorization.
        await sql`INSERT INTO company_offers(company_id,offer_id,owner_user_id) VALUES(${args.companyId},${offer.id},${args.userId})`;
        await sql`INSERT INTO company_access_audit(company_id,actor_id,action,subject_id) VALUES(${args.companyId},${args.userId},'offer.created',${offer.id})`;
      });
    } else if (args.companyId) {
      throw new HttpProblem({
        status: 503,
        title: 'Unavailable',
        detail: 'Banco empresarial indisponível.',
      });
    }
    const written = await this.redis
      .multi()
      .hset(this.key(offer.id), serialize(offer))
      .sadd(this.userKey(args.userId), offer.id)
      .exec();
    if (!written || written.some(([error]) => error))
      throw new Error('Não foi possível salvar a oferta.');
    return offer;
  }

  async update(
    id: string,
    userId: string,
    patch: UpdateOfferRequest,
    isAdmin = false,
  ): Promise<Offer> {
    const current = await this.assertManager(id, userId, isAdmin);

    // Name conflicts (only when changing name).
    if (patch.name && patch.name.trim().toLowerCase() !== current.name.toLowerCase()) {
      const all = await this.listByUser(current.userId);
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

    if (this.db) {
      const [company] = await this.db`
        SELECT c.name FROM company_offers o JOIN companies c ON c.id=o.company_id
        WHERE o.offer_id=${id}`;
      // The old free-text field cannot move or rename a company-bound offer.
      if (company) next.companyName = company.name;
    }

    // Re-write the whole hash so removed optional fields actually disappear.
    await this.redis.multi().del(this.key(id)).hset(this.key(id), serialize(next)).exec();
    return next;
  }

  async get(id: string): Promise<Offer> {
    const data = await this.redis.hgetall(this.key(id));
    if (!data || Object.keys(data).length === 0) {
      throw new NotFoundError(`Oferta não encontrada: ${id}`);
    }
    return deserialize(data);
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
      offers.push(deserialize(rec));
    }
    return offers.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async listAccessible(userId: string, isAdmin = false): Promise<Offer[]> {
    const offers = await this.listAll();
    const permitted = await Promise.all(
      offers.map(async (offer) =>
        (await this.permissions(offer, userId, isAdmin)).read ? offer : null,
      ),
    );
    return permitted
      .filter((offer): offer is Offer => offer !== null)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async permissions(
    offer: Offer,
    userId: string,
    isAdmin = false,
  ): Promise<{ read: boolean; manage: boolean }> {
    if (isAdmin) return { read: true, manage: true };
    if (this.db) {
      const [scope] = await this.db`
        SELECT m.role,m.status,m.tools,m.all_offers,
          EXISTS(SELECT 1 FROM company_offer_grants g WHERE g.company_id=c.company_id AND g.user_id=${userId} AND g.offer_id=c.offer_id) AS granted
        FROM company_offers c LEFT JOIN company_memberships m ON m.company_id=c.company_id AND m.user_id=${userId}
        WHERE c.offer_id=${offer.id}`;
      if (scope) {
        const active = scope.status === 'active';
        const manage = active && ['owner', 'admin'].includes(scope.role);
        return {
          manage,
          read:
            manage ||
            (active &&
              Array.isArray(scope.tools) &&
              scope.tools.includes('ofertas') &&
              (scope.all_offers || scope.granted)),
        };
      }
    }
    return { read: canAccessOffer(offer, userId), manage: canManageOffer(offer, userId) };
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
    const removed = await this.redis
      .multi()
      .del(this.key(id))
      .del(this.credentialKey(id))
      .del(`${AI_CONFIG_PREFIX}${id}`)
      .del(`${AI_HISTORY_PREFIX}${id}`)
      .srem(this.userKey(userId), id)
      .exec();
    if (!removed || removed.some(([error]) => error))
      throw new Error('Não foi possível remover a oferta.');
    // Removing the binding first could re-enable legacy ownership on Redis failure.
    if (this.db) await this.db`DELETE FROM company_offers WHERE offer_id=${id}`;
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
          if (data?.id) offers.push(deserialize(data));
        }
      }
    } while (cursor !== '0');
    return offers;
  }

  async setUtmifyCredentials(id: string, credentials: UtmifyCredentials): Promise<void> {
    await this.redis.set(this.credentialKey(id), this.encrypt(JSON.stringify(credentials)));
    await this.redis.hset(this.key(id), {
      utmifyConfigured: 'true',
      utmifyAccessEnabled: 'true',
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
    if (offer.userId !== userId || !(await this.permissions(offer, userId)).manage) {
      throw new NotFoundError(`Oferta não encontrada: ${id}`);
    }
    return offer;
  }

  async assertManager(id: string, userId: string, isAdmin = false): Promise<Offer> {
    const offer = await this.get(id);
    if (!(await this.permissions(offer, userId, isAdmin)).manage) {
      throw new NotFoundError(`Oferta não encontrada: ${id}`);
    }
    return offer;
  }

  async assertTrackingManager(id: string, userId: string, isAdmin = false): Promise<Offer> {
    return this.requireRole(id, userId, ['owner', 'tracking_manager'], isAdmin);
  }

  async requireRole(
    id: string,
    userId: string,
    allowedRoles: OfferMemberRole[],
    isAdmin = false,
  ): Promise<Offer> {
    const offer = await this.get(id);
    const access = await this.permissions(offer, userId, isAdmin);
    if (!access.read) {
      throw new NotFoundError(`Oferta não encontrada: ${id}`);
    }
    const role: OfferMemberRole = access.manage ? 'owner' : 'member';
    if (!allowedRoles.includes(role)) {
      throw new HttpProblem({
        status: 403,
        title: 'Forbidden',
        detail: 'Somente owners e tracking managers podem alterar o tracking desta oferta.',
        code: 'offer_role_forbidden',
      });
    }
    return offer;
  }

  async assertAccess(id: string, userId: string, isAdmin = false): Promise<Offer> {
    const offer = await this.get(id);
    if (!(await this.permissions(offer, userId, isAdmin)).read) {
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
}

export type {
  OfferAiAnalysisRecord,
  OfferAiPublicConfig,
  OfferAiSecretConfig,
  OfferAiUserPreferences,
  UtmifyCredentials,
} from './offer-store-data.js';
