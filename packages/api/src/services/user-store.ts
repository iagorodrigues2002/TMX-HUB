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
