import type { Redis } from 'ioredis';
import { ulid } from 'ulid';
import type { Niche, NicheWhite } from '@page-cloner/shared';
import { ConflictError, NotFoundError } from '../lib/problem.js';

const NICHE_PREFIX = 'niche:';
const USER_NICHES_PREFIX = 'user-niches:';

export class NicheStore {
  constructor(private readonly redis: Redis) {}

  async create(args: {
    userId: string;
    name: string;
    description?: string;
  }): Promise<Niche> {
    const existing = await this.listByUser(args.userId);
    if (existing.some((n) => n.name.toLowerCase() === args.name.trim().toLowerCase())) {
      throw new ConflictError(`Já existe um nicho chamado "${args.name}".`);
    }
    const niche: Niche = {
      id: ulid(),
      userId: args.userId,
      name: args.name.trim(),
      ...(args.description ? { description: args.description.trim() } : {}),
      whites: [],
      createdAt: new Date().toISOString(),
    };
    await this.redis
      .multi()
      .hset(this.key(niche.id), this.serialize(niche))
      .sadd(this.userKey(args.userId), niche.id)
      .exec();
    return niche;
  }

  async update(
    id: string,
    userId: string,
    patch: { name?: string; description?: string },
  ): Promise<Niche> {
    const current = await this.assertOwner(id, userId);

    if (patch.name && patch.name.trim().toLowerCase() !== current.name.toLowerCase()) {
      const all = await this.listByUser(userId);
      if (
        all.some((n) => n.id !== id && n.name.toLowerCase() === patch.name!.trim().toLowerCase())
      ) {
        throw new ConflictError(`Já existe um nicho chamado "${patch.name}".`);
      }
    }

    const next: Niche = {
      ...current,
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.description !== undefined
        ? { description: patch.description.trim() || undefined }
        : {}),
      updatedAt: new Date().toISOString(),
    };

    await this.redis
      .multi()
      .del(this.key(id))
      .hset(this.key(id), this.serialize(next))
      .exec();
    return next;
  }

  async addWhite(
    nicheId: string,
    userId: string,
    args: { filename: string; storageKey: string; bytes: number; label?: string },
  ): Promise<{ niche: Niche; white: NicheWhite }> {
    const current = await this.assertOwner(nicheId, userId);
    const white: NicheWhite = {
      id: ulid(),
      filename: args.filename,
      storageKey: args.storageKey,
      bytes: args.bytes,
      ...(args.label ? { label: args.label } : {}),
      createdAt: new Date().toISOString(),
    };
    const next: Niche = {
      ...current,
      whites: [...current.whites, white],
      updatedAt: new Date().toISOString(),
    };
    await this.redis
      .multi()
      .del(this.key(nicheId))
      .hset(this.key(nicheId), this.serialize(next))
      .exec();
    return { niche: next, white };
  }

  async removeWhite(nicheId: string, userId: string, whiteId: string): Promise<Niche> {
    const current = await this.assertOwner(nicheId, userId);
    const next: Niche = {
      ...current,
      whites: current.whites.filter((w) => w.id !== whiteId),
      updatedAt: new Date().toISOString(),
    };
    await this.redis
      .multi()
      .del(this.key(nicheId))
      .hset(this.key(nicheId), this.serialize(next))
      .exec();
    return next;
  }

  async get(id: string): Promise<Niche> {
    const data = await this.redis.hgetall(this.key(id));
    if (!data || Object.keys(data).length === 0) {
      throw new NotFoundError(`Nicho não encontrado: ${id}`);
    }
    return this.deserialize(data);
  }

  async listByUser(userId: string): Promise<Niche[]> {
    const ids = await this.redis.smembers(this.userKey(userId));
    if (ids.length === 0) return [];
    const pipeline = this.redis.pipeline();
    for (const id of ids) pipeline.hgetall(this.key(id));
    const results = (await pipeline.exec()) ?? [];
    const out: Niche[] = [];
    for (const [, data] of results) {
      if (!data || typeof data !== 'object') continue;
      const rec = data as Record<string, string>;
      if (!rec.id) continue;
      out.push(this.deserialize(rec));
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  async delete(id: string, userId: string): Promise<Niche> {
    const niche = await this.assertOwner(id, userId);
    await this.redis
      .multi()
      .del(this.key(id))
      .srem(this.userKey(userId), id)
      .exec();
    return niche;
  }

  async assertOwner(id: string, userId: string): Promise<Niche> {
    const n = await this.get(id);
    if (n.userId !== userId) throw new NotFoundError(`Nicho não encontrado: ${id}`);
    return n;
  }

  /** Returns a random white from the niche. Throws if none. */
  pickRandomWhite(niche: Niche): NicheWhite {
    if (niche.whites.length === 0) {
      throw new Error(`Nicho "${niche.name}" não tem whites cadastrados.`);
    }
    const idx = Math.floor(Math.random() * niche.whites.length);
    return niche.whites[idx]!;
  }

  private key(id: string): string {
    return `${NICHE_PREFIX}${id}`;
  }
  private userKey(userId: string): string {
    return `${USER_NICHES_PREFIX}${userId}`;
  }

  private serialize(n: Niche): Record<string, string> {
    const out: Record<string, string> = {
      id: n.id,
      userId: n.userId,
      name: n.name,
      whites: JSON.stringify(n.whites ?? []),
      createdAt: n.createdAt,
    };
    if (n.description) out.description = n.description;
    if (n.updatedAt) out.updatedAt = n.updatedAt;
    return out;
  }

  private deserialize(data: Record<string, string>): Niche {
    let whites: NicheWhite[] = [];
    if (data.whites) {
      try {
        const parsed = JSON.parse(data.whites);
        if (Array.isArray(parsed)) whites = parsed;
      } catch {
        whites = [];
      }
    }
    return {
      id: data.id ?? '',
      userId: data.userId ?? '',
      name: data.name ?? '',
      ...(data.description ? { description: data.description } : {}),
      whites,
      createdAt: data.createdAt ?? '',
      ...(data.updatedAt ? { updatedAt: data.updatedAt } : {}),
    };
  }
}
