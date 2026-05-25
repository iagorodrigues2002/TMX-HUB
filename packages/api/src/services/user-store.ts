import { ulid } from 'ulid';
import type { Redis } from 'ioredis';
import type { ToolKey, User } from '@page-cloner/shared';
import { ConflictError, NotFoundError } from '../lib/problem.js';

const USER_BY_ID_PREFIX = 'user:';
const USER_BY_EMAIL_PREFIX = 'user-email:';

export interface UserRecord extends User {
  passwordHash: string;
}

function emailKey(email: string): string {
  return `${USER_BY_EMAIL_PREFIX}${email.trim().toLowerCase()}`;
}

function idKey(id: string): string {
  return `${USER_BY_ID_PREFIX}${id}`;
}

export class UserStore {
  constructor(private readonly redis: Redis) {}

  async create(args: {
    email: string;
    name: string;
    passwordHash: string;
    role: 'admin' | 'user';
    allowedTools?: ToolKey[];
  }): Promise<UserRecord> {
    const email = args.email.trim().toLowerCase();
    const existingId = await this.redis.get(emailKey(email));
    if (existingId) {
      throw new ConflictError(`Já existe um usuário com o email ${email}.`);
    }
    const rec: UserRecord = {
      id: ulid(),
      email,
      name: args.name.trim(),
      role: args.role,
      passwordHash: args.passwordHash,
      ...(args.allowedTools && args.allowedTools.length > 0
        ? { allowedTools: args.allowedTools }
        : {}),
      createdAt: new Date().toISOString(),
    };
    await this.redis
      .multi()
      .hset(idKey(rec.id), this.serialize(rec))
      .set(emailKey(email), rec.id)
      .exec();
    return rec;
  }

  async getById(id: string): Promise<UserRecord> {
    const data = await this.redis.hgetall(idKey(id));
    if (!data || Object.keys(data).length === 0) {
      throw new NotFoundError(`Usuário não encontrado: ${id}`);
    }
    return this.deserialize(data);
  }

  async maybeGetById(id: string): Promise<UserRecord | null> {
    try {
      return await this.getById(id);
    } catch {
      return null;
    }
  }

  async getByEmail(email: string): Promise<UserRecord | null> {
    const id = await this.redis.get(emailKey(email));
    if (!id) return null;
    return this.maybeGetById(id);
  }

  async count(): Promise<number> {
    // Quick estimate; we don't expect more than a handful of users.
    let cursor = '0';
    let count = 0;
    do {
      const [next, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        `${USER_BY_ID_PREFIX}*`,
        'COUNT',
        '100',
      );
      cursor = next;
      count += keys.length;
    } while (cursor !== '0');
    return count;
  }

  /** Conta admins ativos. Usado pra impedir self-demote/delete do último. */
  async countAdmins(): Promise<number> {
    const users = await this.listAll();
    return users.filter((u) => u.role === 'admin').length;
  }

  /** Lista todos os usuários. SCAN em batches de 100 — OK pra dezenas de users. */
  async listAll(): Promise<UserRecord[]> {
    const out: UserRecord[] = [];
    let cursor = '0';
    do {
      const [next, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        `${USER_BY_ID_PREFIX}*`,
        'COUNT',
        '100',
      );
      cursor = next;
      if (keys.length === 0) continue;
      const pipe = this.redis.pipeline();
      for (const k of keys) pipe.hgetall(k);
      const results = (await pipe.exec()) ?? [];
      for (const entry of results) {
        if (!entry) continue;
        const [, data] = entry;
        if (!data || typeof data !== 'object') continue;
        const rec = data as Record<string, string>;
        if (!rec.id) continue;
        out.push(this.deserialize(rec));
      }
    } while (cursor !== '0');
    return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  /**
   * Atualiza campos editáveis (name, role, allowedTools). Email é imutável.
   * Quando role muda admin → user, valida via countAdmins externamente.
   */
  async update(
    id: string,
    patch: {
      name?: string;
      role?: 'admin' | 'user';
      /** undefined = não muda. null = limpa (acesso total). array = sobrescreve. */
      allowedTools?: ToolKey[] | null;
    },
  ): Promise<UserRecord> {
    const current = await this.getById(id);
    const next: UserRecord = {
      ...current,
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.role !== undefined ? { role: patch.role } : {}),
    };
    if (patch.allowedTools === null) {
      delete next.allowedTools;
    } else if (patch.allowedTools !== undefined) {
      next.allowedTools = patch.allowedTools;
    }
    // Re-grava a hash inteira pra que campos removidos sumam.
    await this.redis
      .multi()
      .del(idKey(id))
      .hset(idKey(id), this.serialize(next))
      .exec();
    return next;
  }

  /**
   * Apaga usuário (hash + índice por email). Caller responsável por validar
   * que não é o último admin / não é o próprio user logado.
   */
  async delete(id: string): Promise<void> {
    const rec = await this.maybeGetById(id);
    if (!rec) return;
    await this.redis
      .multi()
      .del(idKey(id))
      .del(emailKey(rec.email))
      .exec();
  }

  toPublic(rec: UserRecord): User {
    return {
      id: rec.id,
      email: rec.email,
      name: rec.name,
      role: rec.role,
      ...(rec.allowedTools && rec.allowedTools.length > 0
        ? { allowedTools: rec.allowedTools }
        : {}),
      createdAt: rec.createdAt,
    };
  }

  private serialize(rec: UserRecord): Record<string, string> {
    const out: Record<string, string> = {
      id: rec.id,
      email: rec.email,
      name: rec.name,
      role: rec.role,
      passwordHash: rec.passwordHash,
      createdAt: rec.createdAt,
    };
    if (rec.allowedTools && rec.allowedTools.length > 0) {
      out.allowedTools = JSON.stringify(rec.allowedTools);
    }
    return out;
  }

  private deserialize(data: Record<string, string>): UserRecord {
    let allowedTools: ToolKey[] | undefined;
    if (data.allowedTools) {
      try {
        const parsed = JSON.parse(data.allowedTools);
        if (Array.isArray(parsed) && parsed.length > 0) {
          allowedTools = parsed as ToolKey[];
        }
      } catch {
        // ignore — trata como acesso total
      }
    }
    return {
      id: data.id ?? '',
      email: data.email ?? '',
      name: data.name ?? '',
      role: (data.role as 'admin' | 'user') ?? 'user',
      passwordHash: data.passwordHash ?? '',
      ...(allowedTools ? { allowedTools } : {}),
      createdAt: data.createdAt ?? '',
    };
  }
}
