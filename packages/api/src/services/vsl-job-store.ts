import type { VslJob, VslJobStatus, VslManifestKind } from '@page-cloner/shared';
import type { Redis } from 'ioredis';
import { NotFoundError } from '../lib/problem.js';

const VSL_HASH_PREFIX = 'vsl:';

export interface VslJobMetadata extends VslJob {}

export class VslJobStore {
  constructor(private readonly redis: Redis) {}

  async create(args: { id: string; url: string }): Promise<VslJobMetadata> {
    const now = new Date().toISOString();
    const meta: VslJobMetadata = {
      id: args.id,
      url: args.url,
      status: 'queued',
      progress: 0,
      createdAt: now,
      updatedAt: now,
    };
    await this.write(meta);
    return meta;
  }

  async get(id: string): Promise<VslJobMetadata> {
    const data = await this.redis.hgetall(this.key(id));
    if (!data || Object.keys(data).length === 0) {
      throw new NotFoundError(`VSL job not found: ${id}`);
    }
    return this.deserialize(data);
  }

  async maybeGet(id: string): Promise<VslJobMetadata | null> {
    const data = await this.redis.hgetall(this.key(id));
    if (!data || Object.keys(data).length === 0) return null;
    return this.deserialize(data);
  }

  async update(id: string, patch: Partial<VslJobMetadata>): Promise<VslJobMetadata> {
    const meta = await this.get(id);
    const next: VslJobMetadata = {
      ...meta,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    await this.write(next);
    return next;
  }

  async setStatus(
    id: string,
    status: VslJobStatus,
    extra: Partial<VslJobMetadata> = {},
  ): Promise<VslJobMetadata> {
    return this.update(id, { ...extra, status });
  }

  async delete(id: string): Promise<void> {
    await this.redis.del(this.key(id));
  }

  videoKey(id: string): string {
    return `vsl/${id}/output.mp4`;
  }

  whiteVideoKey(id: string): string {
    return `vsl/${id}/white.mp4`;
  }

  private key(id: string): string {
    return `${VSL_HASH_PREFIX}${id}`;
  }

  private async write(meta: VslJobMetadata): Promise<void> {
    await this.redis.hset(this.key(meta.id), this.serialize(meta));
    // Auto-expire after 7 days; the S3 object has its own lifecycle.
    await this.redis.expire(this.key(meta.id), 7 * 24 * 60 * 60);
  }

  private serialize(meta: VslJobMetadata): Record<string, string> {
    const out: Record<string, string> = {
      id: meta.id,
      url: meta.url,
      status: meta.status,
      progress: String(meta.progress),
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
    };
    if (meta.manifestUrl) out.manifestUrl = meta.manifestUrl;
    if (meta.manifestKind) out.manifestKind = meta.manifestKind;
    if (meta.bytes !== undefined) out.bytes = String(meta.bytes);
    if (meta.durationSec !== undefined) out.durationSec = String(meta.durationSec);
    if (meta.filename) out.filename = meta.filename;
    if (meta.storageKey) out.storageKey = meta.storageKey;
    if (meta.cloakerDetected !== undefined) out.cloakerDetected = meta.cloakerDetected ? '1' : '0';
    if (meta.whiteManifestUrl) out.whiteManifestUrl = meta.whiteManifestUrl;
    if (meta.whiteFilename) out.whiteFilename = meta.whiteFilename;
    if (meta.whiteStorageKey) out.whiteStorageKey = meta.whiteStorageKey;
    if (meta.whiteBytes !== undefined) out.whiteBytes = String(meta.whiteBytes);
    if (meta.expiresAt) out.expiresAt = meta.expiresAt;
    if (meta.errorCode) out.errorCode = meta.errorCode;
    if (meta.errorMessage) out.errorMessage = meta.errorMessage;
    return out;
  }

  private deserialize(data: Record<string, string>): VslJobMetadata {
    const meta: VslJobMetadata = {
      id: data.id ?? '',
      url: data.url ?? '',
      status: (data.status as VslJobStatus) ?? 'queued',
      progress: data.progress ? Number.parseInt(data.progress, 10) : 0,
      createdAt: data.createdAt ?? '',
      updatedAt: data.updatedAt ?? '',
    };
    if (data.manifestUrl) meta.manifestUrl = data.manifestUrl;
    if (data.manifestKind) meta.manifestKind = data.manifestKind as VslManifestKind;
    if (data.bytes) meta.bytes = Number.parseInt(data.bytes, 10);
    if (data.durationSec) meta.durationSec = Number.parseFloat(data.durationSec);
    if (data.filename) meta.filename = data.filename;
    if (data.storageKey) meta.storageKey = data.storageKey;
    if (data.cloakerDetected !== undefined) meta.cloakerDetected = data.cloakerDetected === '1';
    if (data.whiteManifestUrl) meta.whiteManifestUrl = data.whiteManifestUrl;
    if (data.whiteFilename) meta.whiteFilename = data.whiteFilename;
    if (data.whiteStorageKey) meta.whiteStorageKey = data.whiteStorageKey;
    if (data.whiteBytes) meta.whiteBytes = Number.parseInt(data.whiteBytes, 10);
    if (data.expiresAt) meta.expiresAt = data.expiresAt;
    if (data.errorCode) meta.errorCode = data.errorCode;
    if (data.errorMessage) meta.errorMessage = data.errorMessage;
    return meta;
  }
}
