import type { Redis } from 'ioredis';
import { ulid } from 'ulid';
import type { Offer, OfferLink, OfferStatus, UpdateOfferRequest } from '@page-cloner/shared';
import { ConflictError, NotFoundError } from '../lib/problem.js';

const OFFER_PREFIX = 'offer:';            // {id} → hash
const USER_OFFERS_PREFIX = 'user-offers:'; // {userId} → set of offer ids

const VALID_STATUSES: OfferStatus[] = [
  'testando',
  'validando',
  'escala',
  'pausado',
  'morrendo',
];

function isValidStatus(s: unknown): s is OfferStatus {
  return typeof s === 'string' && VALID_STATUSES.includes(s as OfferStatus);
}

function safeParseLinks(raw: string | undefined): OfferLink[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((l) => l && typeof l === 'object' && typeof l.id === 'string')
      .map((l) => ({
        id: String(l.id),
        ...(typeof l.label === 'string' && l.label ? { label: l.label } : {}),
        ...(typeof l.whiteUrl === 'string' && l.whiteUrl ? { whiteUrl: l.whiteUrl } : {}),
        ...(typeof l.blackUrl === 'string' && l.blackUrl ? { blackUrl: l.blackUrl } : {}),
      }));
  } catch {
    return [];
  }
}

export class OfferStore {
  constructor(private readonly redis: Redis) {}

  async create(args: {
    userId: string;
    name: string;
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
      ...(args.dashboardId ? { dashboardId: args.dashboardId.trim() } : {}),
      ...(args.description ? { description: args.description.trim() } : {}),
      status: args.status ?? 'testando',
      fronts: [],
      upsells: [],
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
      if (all.some((o) => o.id !== id && o.name.toLowerCase() === patch.name!.trim().toLowerCase())) {
        throw new ConflictError(`Já existe uma oferta chamada "${patch.name}".`);
      }
    }

    const next: Offer = {
      ...current,
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.dashboard_id !== undefined
        ? { dashboardId: patch.dashboard_id.trim() || undefined }
        : {}),
      ...(patch.description !== undefined
        ? { description: patch.description.trim() || undefined }
        : {}),
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.fronts ? { fronts: patch.fronts } : {}),
      ...(patch.upsells ? { upsells: patch.upsells } : {}),
      updatedAt: new Date().toISOString(),
    };

    // Re-write the whole hash so removed optional fields actually disappear.
    await this.redis
      .multi()
      .del(this.key(id))
      .hset(this.key(id), this.serialize(next))
      .exec();
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
      .srem(this.userKey(userId), id)
      .exec();
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

  private serialize(offer: Offer): Record<string, string> {
    const out: Record<string, string> = {
      id: offer.id,
      userId: offer.userId,
      name: offer.name,
      status: offer.status,
      fronts: JSON.stringify(offer.fronts ?? []),
      upsells: JSON.stringify(offer.upsells ?? []),
      createdAt: offer.createdAt,
    };
    if (offer.dashboardId) out.dashboardId = offer.dashboardId;
    if (offer.description) out.description = offer.description;
    if (offer.updatedAt) out.updatedAt = offer.updatedAt;
    return out;
  }

  private deserialize(data: Record<string, string>): Offer {
    const status = isValidStatus(data.status) ? data.status : 'testando';
    return {
      id: data.id ?? '',
      userId: data.userId ?? '',
      name: data.name ?? '',
      ...(data.dashboardId ? { dashboardId: data.dashboardId } : {}),
      ...(data.description ? { description: data.description } : {}),
      status,
      fronts: safeParseLinks(data.fronts),
      upsells: safeParseLinks(data.upsells),
      createdAt: data.createdAt ?? '',
      ...(data.updatedAt ? { updatedAt: data.updatedAt } : {}),
    };
  }
}
