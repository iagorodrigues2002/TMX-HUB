import type { Redis } from 'ioredis';
import { ulid } from 'ulid';
import type {
  DigiAudit,
  DigiAuditItem,
  DigiAuditStatus,
  UpdateDigiAuditRequest,
} from '@page-cloner/shared';
import { NotFoundError } from '../lib/problem.js';

const AUDIT_PREFIX = 'digi-audit:';
const USER_AUDITS_PREFIX = 'user-digi-audits:';

export class DigiAuditStore {
  constructor(private readonly redis: Redis) {}

  async create(args: {
    userId: string;
    productName: string;
    offerId?: string;
  }): Promise<DigiAudit> {
    const now = new Date().toISOString();
    const audit: DigiAudit = {
      id: ulid(),
      userId: args.userId,
      productName: args.productName.trim(),
      ...(args.offerId ? { offerId: args.offerId } : {}),
      status: 'draft',
      items: {},
      createdAt: now,
      updatedAt: now,
    };
    await this.write(audit);
    await this.redis.sadd(this.userKey(args.userId), audit.id);
    return audit;
  }

  async update(id: string, userId: string, patch: UpdateDigiAuditRequest): Promise<DigiAudit> {
    const current = await this.assertOwner(id, userId);
    const next: DigiAudit = {
      ...current,
      ...(patch.product_name !== undefined ? { productName: patch.product_name.trim() } : {}),
      ...(patch.offer_id !== undefined
        ? { offerId: patch.offer_id.trim() || undefined }
        : {}),
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      // Items are merged (not replaced) so the client only sends changed keys.
      items: patch.items ? mergeItems(current.items, patch.items) : current.items,
      updatedAt: new Date().toISOString(),
    };
    await this.write(next);
    return next;
  }

  async get(id: string): Promise<DigiAudit> {
    const data = await this.redis.hgetall(this.key(id));
    if (!data || Object.keys(data).length === 0) {
      throw new NotFoundError(`Audit não encontrada: ${id}`);
    }
    return this.deserialize(data);
  }

  async assertOwner(id: string, userId: string): Promise<DigiAudit> {
    const a = await this.get(id);
    if (a.userId !== userId) throw new NotFoundError(`Audit não encontrada: ${id}`);
    return a;
  }

  async listByUser(userId: string): Promise<DigiAudit[]> {
    const ids = await this.redis.smembers(this.userKey(userId));
    if (ids.length === 0) return [];
    const pipeline = this.redis.pipeline();
    for (const id of ids) pipeline.hgetall(this.key(id));
    const results = (await pipeline.exec()) ?? [];
    const out: DigiAudit[] = [];
    const stale: string[] = [];
    for (let i = 0; i < results.length; i++) {
      const entry = results[i];
      if (!entry) continue;
      const [, data] = entry;
      if (!data || typeof data !== 'object') {
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
      await this.redis.srem(this.userKey(userId), ...stale).catch(() => {});
    }
    return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async delete(id: string, userId: string): Promise<void> {
    await this.assertOwner(id, userId);
    await this.redis.multi().del(this.key(id)).srem(this.userKey(userId), id).exec();
  }

  private key(id: string): string {
    return `${AUDIT_PREFIX}${id}`;
  }
  private userKey(userId: string): string {
    return `${USER_AUDITS_PREFIX}${userId}`;
  }

  private async write(a: DigiAudit): Promise<void> {
    await this.redis.hset(this.key(a.id), this.serialize(a));
    // 365-day TTL — audits are reference material; we don't want them to vanish.
    await this.redis.expire(this.key(a.id), 365 * 24 * 60 * 60);
  }

  private serialize(a: DigiAudit): Record<string, string> {
    const out: Record<string, string> = {
      id: a.id,
      userId: a.userId,
      productName: a.productName,
      status: a.status,
      items: JSON.stringify(a.items ?? {}),
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    };
    if (a.offerId) out.offerId = a.offerId;
    if (a.notes) out.notes = a.notes;
    return out;
  }

  private deserialize(data: Record<string, string>): DigiAudit {
    let items: Record<string, DigiAuditItem> = {};
    if (data.items) {
      try {
        const parsed = JSON.parse(data.items);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) items = parsed;
      } catch {
        items = {};
      }
    }
    return {
      id: data.id ?? '',
      userId: data.userId ?? '',
      productName: data.productName ?? '',
      ...(data.offerId ? { offerId: data.offerId } : {}),
      status: (data.status as DigiAuditStatus) ?? 'draft',
      items,
      ...(data.notes ? { notes: data.notes } : {}),
      createdAt: data.createdAt ?? '',
      updatedAt: data.updatedAt ?? '',
    };
  }
}

function mergeItems(
  current: Record<string, DigiAuditItem>,
  patch: Record<string, DigiAuditItem>,
): Record<string, DigiAuditItem> {
  const next = { ...current };
  for (const [k, v] of Object.entries(patch)) {
    next[k] = v;
  }
  return next;
}
