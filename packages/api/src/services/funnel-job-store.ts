import type { FunnelJob, FunnelJobStatus, FunnelPage } from '@page-cloner/shared';
import type { Redis } from 'ioredis';
import { NotFoundError } from '../lib/problem.js';

const HASH_PREFIX = 'funnel:';
const TTL_SEC = 7 * 24 * 60 * 60;

export interface FunnelJobMetadata extends FunnelJob {}

export class FunnelJobStore {
  constructor(private readonly redis: Redis) {}

  async create(args: {
    id: string;
    url: string;
    maxDepth: number;
    maxPages: number;
  }): Promise<FunnelJobMetadata> {
    const now = new Date().toISOString();
    const meta: FunnelJobMetadata = {
      id: args.id,
      rootUrl: args.url,
      status: 'queued',
      progress: 0,
      maxDepth: args.maxDepth,
      maxPages: args.maxPages,
      pages: [],
      createdAt: now,
      updatedAt: now,
    };
    await this.write(meta);
    return meta;
  }

  async get(id: string): Promise<FunnelJobMetadata> {
    const data = await this.redis.hgetall(this.key(id));
    if (!data || Object.keys(data).length === 0) {
      throw new NotFoundError(`Funnel job not found: ${id}`);
    }
    return this.deserialize(data);
  }

  async update(id: string, patch: Partial<FunnelJobMetadata>): Promise<FunnelJobMetadata> {
    const meta = await this.get(id);
    const next = { ...meta, ...patch, updatedAt: new Date().toISOString() };
    await this.write(next);
    return next;
  }

  async setStatus(
    id: string,
    status: FunnelJobStatus,
    extra: Partial<FunnelJobMetadata> = {},
  ): Promise<FunnelJobMetadata> {
    return this.update(id, { ...extra, status });
  }

  async appendPage(id: string, page: FunnelPage): Promise<FunnelJobMetadata> {
    const meta = await this.get(id);
    const pages = [...meta.pages, page];
    return this.update(id, { pages });
  }

  zipKey(id: string): string {
    return `funnels/${id}/funnel.zip`;
  }

  private key(id: string): string {
    return `${HASH_PREFIX}${id}`;
  }

  private async write(meta: FunnelJobMetadata): Promise<void> {
    await this.redis.hset(this.key(meta.id), {
      id: meta.id,
      rootUrl: meta.rootUrl,
      status: meta.status,
      progress: String(meta.progress),
      maxDepth: String(meta.maxDepth),
      maxPages: String(meta.maxPages),
      pages: JSON.stringify(meta.pages),
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
      ...(meta.totalBytes !== undefined ? { totalBytes: String(meta.totalBytes) } : {}),
      ...(meta.filename ? { filename: meta.filename } : {}),
      ...(meta.storageKey ? { storageKey: meta.storageKey } : {}),
      ...(meta.expiresAt ? { expiresAt: meta.expiresAt } : {}),
      ...(meta.errorCode ? { errorCode: meta.errorCode } : {}),
      ...(meta.errorMessage ? { errorMessage: meta.errorMessage } : {}),
    });
    await this.redis.expire(this.key(meta.id), TTL_SEC);
  }

  private deserialize(data: Record<string, string>): FunnelJobMetadata {
    let pages: FunnelPage[] = [];
    try {
      pages = data.pages ? JSON.parse(data.pages) : [];
    } catch {
      pages = [];
    }
    return {
      id: data.id ?? '',
      rootUrl: data.rootUrl ?? '',
      status: (data.status as FunnelJobStatus) ?? 'queued',
      progress: data.progress ? Number.parseInt(data.progress, 10) : 0,
      maxDepth: data.maxDepth ? Number.parseInt(data.maxDepth, 10) : 4,
      maxPages: data.maxPages ? Number.parseInt(data.maxPages, 10) : 12,
      pages,
      ...(data.totalBytes ? { totalBytes: Number.parseInt(data.totalBytes, 10) } : {}),
      ...(data.filename ? { filename: data.filename } : {}),
      ...(data.storageKey ? { storageKey: data.storageKey } : {}),
      ...(data.expiresAt ? { expiresAt: data.expiresAt } : {}),
      ...(data.errorCode ? { errorCode: data.errorCode } : {}),
      ...(data.errorMessage ? { errorMessage: data.errorMessage } : {}),
      createdAt: data.createdAt ?? '',
      updatedAt: data.updatedAt ?? '',
    };
  }
}
