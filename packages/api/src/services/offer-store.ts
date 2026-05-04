import type { Redis } from 'ioredis';
import { ulid } from 'ulid';
import type { Offer } from '@page-cloner/shared';
import { ConflictError, NotFoundError } from '../lib/problem.js';

const OFFER_PREFIX = 'offer:';            // {id} → hash
const USER_OFFERS_PREFIX = 'user-offers:'; // {userId} → set of offer ids

export class OfferStore {
  constructor(private readonly redis: Redis) {}

  async create(args: {
    userId: string;
    name: string;
    dashboardId?: string;
    description?: string;
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
      createdAt: new Date().toISOString(),
    };
    await this.redis
      .multi()
      .hset(this.key(offer.id), this.serialize(offer))
      .sadd(this.userKey(args.userId), offer.id)
      .exec();
    return offer;
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
      createdAt: offer.createdAt,
    };
    if (offer.dashboardId) out.dashboardId = offer.dashboardId;
    if (offer.description) out.description = offer.description;
    return out;
  }

  private deserialize(data: Record<string, string>): Offer {
    return {
      id: data.id ?? '',
      userId: data.userId ?? '',
      name: data.name ?? '',
      ...(data.dashboardId ? { dashboardId: data.dashboardId } : {}),
      ...(data.description ? { description: data.description } : {}),
      createdAt: data.createdAt ?? '',
    };
  }
}
