import type { ToolKey, User } from '@page-cloner/shared';
import type { Redis } from 'ioredis';
import { ulid } from 'ulid';
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
    /** Registration-only preconditions, checked in the same Redis operation. */
    requireEmptyStore?: boolean;
    invite?: { token: string; createdAt: string };
  }): Promise<UserRecord> {
    const email = args.email.trim().toLowerCase();
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
    // One atomic decision: no email race, no second bootstrap administrator,
    // and no account surviving an already-used/revoked invitation.
    const result = Number(
      await this.redis.eval(
        `
      if redis.call('EXISTS', KEYS[2]) == 1 then return 0 end
      if ARGV[2] == '1' then
        local cursor = '0'
        repeat
          local page = redis.call('SCAN', cursor, 'MATCH', 'user:*', 'COUNT', 100)
          cursor = page[1]
          if #page[2] > 0 then return -1 end
        until cursor == '0'
      end
      if ARGV[4] ~= '' then
        if ARGV[3] == '' or redis.call('HGET', KEYS[3], 'createdAt') ~= ARGV[3] then return -2 end
      end
      local fields = cjson.decode(ARGV[1])
      for key, value in pairs(fields) do redis.call('HSET', KEYS[1], key, value) end
      redis.call('SET', KEYS[2], fields.id)
      if ARGV[4] ~= '' then
        redis.call('DEL', KEYS[3])
        redis.call('ZREM', KEYS[4], ARGV[4])
      end
      return 1
    `,
        4,
        idKey(rec.id),
        emailKey(email),
        args.invite ? `invite:${args.invite.token}` : 'invite:unused',
        'invite-index',
        JSON.stringify(this.serialize(rec)),
        args.requireEmptyStore ? '1' : '0',
        args.invite?.createdAt ?? '',
        args.invite?.token ?? '',
      ),
    );
    if (result === 0) throw new ConflictError(`Já existe um usuário com o email ${email}.`);
    if (result === -1)
      throw new ConflictError('O cadastro inicial já foi concluído. Atualize a página.');
    if (result === -2) throw new ConflictError('Convite inválido, expirado ou já utilizado.');
    if (result !== 1) throw new Error('Atomic account creation failed.');
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
    const { allowedTools: _allowedTools, ...withoutTools } = current;
    const next: UserRecord = {
      ...(patch.allowedTools === null ? withoutTools : current),
      ...(patch.allowedTools != null ? { allowedTools: patch.allowedTools } : {}),
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.role !== undefined ? { role: patch.role } : {}),
    };
    // Re-grava a hash inteira pra que campos removidos sumam.
    await this.redis.multi().del(idKey(id)).hset(idKey(id), this.serialize(next)).exec();
    return next;
  }

  /** Atualiza só o segredo, preservando identidade, papel e permissões. */
  async setPasswordHash(id: string, passwordHash: string): Promise<void> {
    await this.getById(id);
    await this.redis.hset(idKey(id), { passwordHash });
  }

  /**
   * Apaga usuário (hash + índice por email). Caller responsável por validar
   * que não é o último admin / não é o próprio user logado.
   */
  async delete(id: string): Promise<void> {
    const rec = await this.maybeGetById(id);
    if (!rec) return;
    await this.redis.multi().del(idKey(id)).del(emailKey(rec.email)).exec();
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
