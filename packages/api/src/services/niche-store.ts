import type { Redis } from 'ioredis';
import { ulid } from 'ulid';
import type { Niche, NicheWhite } from '@page-cloner/shared';
import { ConflictError, HttpProblem, NotFoundError } from '../lib/problem.js';

const NICHE_PREFIX = 'niche:';
const NICHES_GLOBAL = 'niches:global';        // SET com todos os IDs ativos
const USER_NICHES_PREFIX = 'user-niches:';    // legado — kept p/ migração idempotente
const MIGRATION_FLAG = 'niches:migration:global-v1';

class ForbiddenError extends HttpProblem {
  constructor(detail = 'Operação não permitida.') {
    super({ status: 403, title: 'Forbidden', detail, code: 'forbidden' });
  }
}

export class NicheStore {
  constructor(private readonly redis: Redis) {}

  async create(args: {
    userId: string;
    name: string;
    description?: string;
  }): Promise<Niche> {
    // Conflito é avaliado contra TODOS os nichos (global), não só os do user.
    const existing = await this.listAll();
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
      .sadd(NICHES_GLOBAL, niche.id)
      // Mantém o índice por user pra ainda saber a autoria via SISMEMBER
      // (não precisa pra leitura — o campo userId já carrega isso).
      .sadd(this.userKey(args.userId), niche.id)
      .exec();
    return niche;
  }

  async update(
    id: string,
    userId: string,
    isAdmin: boolean,
    patch: { name?: string; description?: string },
  ): Promise<Niche> {
    const current = await this.assertCanModify(id, userId, isAdmin);

    if (patch.name && patch.name.trim().toLowerCase() !== current.name.toLowerCase()) {
      const all = await this.listAll();
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
    isAdmin: boolean,
    args: { filename: string; storageKey: string; bytes: number; label?: string },
  ): Promise<{ niche: Niche; white: NicheWhite }> {
    const current = await this.assertCanModify(nicheId, userId, isAdmin);
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

  async removeWhite(
    nicheId: string,
    userId: string,
    isAdmin: boolean,
    whiteId: string,
  ): Promise<Niche> {
    const current = await this.assertCanModify(nicheId, userId, isAdmin);
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

  /**
   * Lista TODOS os nichos da instância (são compartilhados entre usuários).
   * Limpa do índice global os que não existem mais (TTL/falhas).
   */
  async listAll(): Promise<Niche[]> {
    const ids = await this.redis.smembers(NICHES_GLOBAL);
    if (ids.length === 0) return [];
    const pipeline = this.redis.pipeline();
    for (const id of ids) pipeline.hgetall(this.key(id));
    const results = (await pipeline.exec()) ?? [];
    const out: Niche[] = [];
    const stale: string[] = [];
    for (let i = 0; i < results.length; i++) {
      const entry = results[i];
      if (!entry) continue;
      const [, data] = entry;
      if (!data || typeof data !== 'object' || Object.keys(data as object).length === 0) {
        stale.push(ids[i]!);
        continue;
      }
      const rec = data as Record<string, string>;
      if (!rec.id) {
        stale.push(ids[i]!);
        continue;
      }
      out.push(this.deserialize(rec));
    }
    if (stale.length > 0) {
      await this.redis.srem(NICHES_GLOBAL, ...stale).catch(() => {});
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  async delete(id: string, userId: string, isAdmin: boolean): Promise<Niche> {
    const niche = await this.assertCanModify(id, userId, isAdmin);
    await this.redis
      .multi()
      .del(this.key(id))
      .srem(NICHES_GLOBAL, id)
      .srem(this.userKey(niche.userId), id)
      .exec();
    return niche;
  }

  /**
   * Admin pode tudo. Usuário comum só pode modificar nichos que ele criou.
   * Throw 403 caso contrário.
   */
  async assertCanModify(id: string, userId: string, isAdmin: boolean): Promise<Niche> {
    const n = await this.get(id);
    if (!isAdmin && n.userId !== userId) {
      throw new ForbiddenError(
        'Apenas o criador do nicho ou um admin podem modificá-lo.',
      );
    }
    return n;
  }

  /** Retorna se o usuário pode modificar o nicho (sem throw). */
  canModify(niche: Niche, userId: string, isAdmin: boolean): boolean {
    return isAdmin || niche.userId === userId;
  }

  /** Returns a random white from the niche. Throws if none. */
  pickRandomWhite(niche: Niche): NicheWhite {
    if (niche.whites.length === 0) {
      throw new Error(`Nicho "${niche.name}" não tem whites cadastrados.`);
    }
    const idx = Math.floor(Math.random() * niche.whites.length);
    return niche.whites[idx]!;
  }

  /**
   * Migração idempotente: pega todos os IDs em `user-niches:*` (modelo antigo
   * per-user) e adiciona ao set global `niches:global`. Marca flag pra não
   * rodar de novo. Pode ser chamado N vezes sem efeito colateral.
   */
  async migrateToGlobalOnce(): Promise<{ migrated: number; alreadyDone: boolean }> {
    const done = await this.redis.get(MIGRATION_FLAG);
    if (done) return { migrated: 0, alreadyDone: true };

    let cursor = '0';
    let migrated = 0;
    do {
      const [next, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        `${USER_NICHES_PREFIX}*`,
        'COUNT',
        100,
      );
      cursor = next;
      for (const key of keys) {
        const ids = await this.redis.smembers(key);
        if (ids.length > 0) {
          await this.redis.sadd(NICHES_GLOBAL, ...ids);
          migrated += ids.length;
        }
      }
    } while (cursor !== '0');

    await this.redis.set(MIGRATION_FLAG, new Date().toISOString());
    return { migrated, alreadyDone: false };
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
