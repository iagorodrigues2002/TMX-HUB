import type { Redis } from 'ioredis';
import { ulid } from 'ulid';
import { NotFoundError } from '../lib/problem.js';

const INVITE_PREFIX = 'invite:';
const INVITE_INDEX = 'invite-index'; // ZSET com createdAt (epoch ms) score

/**
 * Convite gerado por admin, consumido por novo usuário ao se registrar.
 * Token = ULID (URL-safe). Expira via Redis TTL; ao ser usado, é deletado.
 */
export interface Invite {
  token: string;
  /** Email opcional pra pré-preencher na UI; não restringe o uso. */
  email?: string;
  /** Nome opcional pra pré-preencher. */
  name?: string;
  createdBy: string;        // userId do admin que gerou
  createdByName?: string;
  createdAt: string;        // ISO
  expiresAt: string;        // ISO
}

export class InviteStore {
  constructor(private readonly redis: Redis) {}

  async create(args: {
    createdBy: string;
    createdByName?: string;
    email?: string;
    name?: string;
    expiresInSec: number;
  }): Promise<Invite> {
    const now = Date.now();
    const token = ulid();
    const invite: Invite = {
      token,
      ...(args.email ? { email: args.email.trim().toLowerCase() } : {}),
      ...(args.name ? { name: args.name.trim() } : {}),
      createdBy: args.createdBy,
      ...(args.createdByName ? { createdByName: args.createdByName } : {}),
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + args.expiresInSec * 1000).toISOString(),
    };
    await this.redis
      .multi()
      .hset(this.key(token), this.serialize(invite))
      .expire(this.key(token), args.expiresInSec)
      .zadd(INVITE_INDEX, now, token)
      .exec();
    return invite;
  }

  async get(token: string): Promise<Invite | null> {
    const data = await this.redis.hgetall(this.key(token));
    if (!data || Object.keys(data).length === 0) return null;
    return this.deserialize(data);
  }

  /** Lista todos os convites ativos. Limpa do índice os já expirados. */
  async listActive(): Promise<Invite[]> {
    const tokens = await this.redis.zrange(INVITE_INDEX, 0, -1);
    if (tokens.length === 0) return [];
    const pipe = this.redis.pipeline();
    for (const t of tokens) pipe.hgetall(this.key(t));
    const results = (await pipe.exec()) ?? [];
    const out: Invite[] = [];
    const stale: string[] = [];
    for (let i = 0; i < results.length; i++) {
      const entry = results[i];
      if (!entry) continue;
      const [, data] = entry;
      if (!data || typeof data !== 'object' || Object.keys(data as object).length === 0) {
        stale.push(tokens[i]!);
        continue;
      }
      out.push(this.deserialize(data as Record<string, string>));
    }
    if (stale.length > 0) {
      await this.redis.zrem(INVITE_INDEX, ...stale).catch(() => {});
    }
    return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async consume(token: string): Promise<Invite> {
    const invite = await this.get(token);
    if (!invite) throw new NotFoundError('Convite inválido ou expirado.');
    await this.redis
      .multi()
      .del(this.key(token))
      .zrem(INVITE_INDEX, token)
      .exec();
    return invite;
  }

  async revoke(token: string): Promise<void> {
    await this.redis
      .multi()
      .del(this.key(token))
      .zrem(INVITE_INDEX, token)
      .exec();
  }

  private key(token: string): string {
    return `${INVITE_PREFIX}${token}`;
  }

  private serialize(i: Invite): Record<string, string> {
    const out: Record<string, string> = {
      token: i.token,
      createdBy: i.createdBy,
      createdAt: i.createdAt,
      expiresAt: i.expiresAt,
    };
    if (i.email) out.email = i.email;
    if (i.name) out.name = i.name;
    if (i.createdByName) out.createdByName = i.createdByName;
    return out;
  }

  private deserialize(d: Record<string, string>): Invite {
    return {
      token: d.token ?? '',
      ...(d.email ? { email: d.email } : {}),
      ...(d.name ? { name: d.name } : {}),
      createdBy: d.createdBy ?? '',
      ...(d.createdByName ? { createdByName: d.createdByName } : {}),
      createdAt: d.createdAt ?? '',
      expiresAt: d.expiresAt ?? '',
    };
  }
}
