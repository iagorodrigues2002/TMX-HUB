import { createHash } from 'node:crypto';
import type {
  BuildJob,
  BundleFormat,
  CloneOptions,
  CloneState,
  CloneStatus,
} from '@page-cloner/shared';
import type { Redis } from 'ioredis';
import { NotFoundError } from '../lib/problem.js';
import type { StorageService } from './storage.js';

const JOB_HASH_PREFIX = 'clone:';
const BUILD_HASH_PREFIX = 'build:';
const IDEMPOTENCY_PREFIX = 'idem:';
const IDEMPOTENCY_TTL_SEC = 60 * 60 * 24;

export interface CloneMetadata {
  id: string;
  status: CloneStatus;
  sourceUrl: string;
  finalUrl?: string;
  webhookUrl?: string;
  options: CloneOptions;
  createdAt: string;
  updatedAt: string;
  renderedAt?: string;
  progress: number;
  forms: number;
  links: number;
  assets: number;
  bytes: number;
  errorCode?: string;
  errorMessage?: string;
  etag: string;
}

export interface BuildMetadata {
  id: string;
  cloneId: string;
  status: 'queued' | 'building' | 'ready' | 'failed';
  format: BundleFormat;
  inlineAssets: boolean;
  applyEdits: boolean;
  createdAt: string;
  updatedAt: string;
  bytes?: number;
  contentType?: string;
  sha256?: string;
  filename?: string;
  storageKey?: string;
  expiresAt?: string;
  errorCode?: string;
  errorMessage?: string;
}

interface IdempotencyRecord {
  bodyHash: string;
  jobId: string;
}

export class JobStore {
  constructor(
    private readonly redis: Redis,
    private readonly storage: StorageService,
  ) {}

  // ---------- Clone job lifecycle ----------

  async createClone(args: {
    id: string;
    sourceUrl: string;
    options: CloneOptions;
    webhookUrl?: string;
  }): Promise<CloneMetadata> {
    const now = new Date().toISOString();
    const meta: CloneMetadata = {
      id: args.id,
      status: 'queued',
      sourceUrl: args.sourceUrl,
      ...(args.webhookUrl ? { webhookUrl: args.webhookUrl } : {}),
      options: args.options,
      createdAt: now,
      updatedAt: now,
      progress: 0,
      forms: 0,
      links: 0,
      assets: 0,
      bytes: 0,
      etag: this.computeEtag({ id: args.id, status: 'queued', updatedAt: now }),
    };
    await this.writeCloneMeta(meta);
    return meta;
  }

  async getCloneMeta(id: string): Promise<CloneMetadata> {
    const key = JOB_HASH_PREFIX + id;
    const data = await this.redis.hgetall(key);
    if (!data || Object.keys(data).length === 0) {
      throw new NotFoundError(`No clone job with id ${id}.`);
    }
    return this.deserializeMeta(data);
  }

  async maybeGetCloneMeta(id: string): Promise<CloneMetadata | null> {
    try {
      return await this.getCloneMeta(id);
    } catch (err) {
      if (err instanceof NotFoundError) return null;
      throw err;
    }
  }

  async setCloneStatus(
    id: string,
    status: CloneStatus,
    patch: Partial<CloneMetadata> = {},
  ): Promise<CloneMetadata> {
    const current = await this.getCloneMeta(id);
    const now = new Date().toISOString();
    const updated: CloneMetadata = {
      ...current,
      ...patch,
      status,
      updatedAt: now,
      etag: this.computeEtag({ id, status, updatedAt: now }),
    };
    await this.writeCloneMeta(updated);
    return updated;
  }

  async getCloneState(id: string): Promise<CloneState> {
    return this.storage.getJson<CloneState>(this.stateKey(id));
  }

  async saveCloneState(state: CloneState): Promise<void> {
    await this.storage.putJson(this.stateKey(state.jobId), state);
  }

  async deleteClone(id: string): Promise<void> {
    await this.redis.del(JOB_HASH_PREFIX + id);
    await this.storage.deletePrefix(`clones/${id}/`);
    // Also drop the build registry list (best-effort).
    const buildIds = await this.listBuildIdsFor(id);
    if (buildIds.length > 0) {
      const pipe = this.redis.pipeline();
      for (const bid of buildIds) pipe.del(BUILD_HASH_PREFIX + bid);
      pipe.del(`clone-builds:${id}`);
      await pipe.exec();
    }
  }

  // ---------- Build job lifecycle ----------

  async createBuild(meta: BuildMetadata): Promise<BuildMetadata> {
    await this.writeBuildMeta(meta);
    await this.redis.sadd(`clone-builds:${meta.cloneId}`, meta.id);
    return meta;
  }

  async getBuildMeta(buildId: string): Promise<BuildMetadata> {
    const data = await this.redis.hgetall(BUILD_HASH_PREFIX + buildId);
    if (!data || Object.keys(data).length === 0) {
      throw new NotFoundError(`No build job with id ${buildId}.`);
    }
    return this.deserializeBuildMeta(data);
  }

  async updateBuild(buildId: string, patch: Partial<BuildMetadata>): Promise<BuildMetadata> {
    const current = await this.getBuildMeta(buildId);
    const updated: BuildMetadata = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    await this.writeBuildMeta(updated);
    return updated;
  }

  async listBuildIdsFor(cloneId: string): Promise<string[]> {
    return this.redis.smembers(`clone-builds:${cloneId}`);
  }

  // ---------- Idempotency ----------

  async checkIdempotency(
    key: string,
    body: unknown,
  ): Promise<{ hit: false } | { hit: true; jobId: string } | { hit: 'conflict' }> {
    const bodyHash = this.hashBody(body);
    const redisKey = IDEMPOTENCY_PREFIX + key;
    const existing = await this.redis.get(redisKey);
    if (!existing) return { hit: false };
    try {
      const parsed = JSON.parse(existing) as IdempotencyRecord;
      if (parsed.bodyHash !== bodyHash) return { hit: 'conflict' };
      return { hit: true, jobId: parsed.jobId };
    } catch {
      return { hit: false };
    }
  }

  async storeIdempotency(key: string, body: unknown, jobId: string): Promise<void> {
    const record: IdempotencyRecord = {
      bodyHash: this.hashBody(body),
      jobId,
    };
    await this.redis.set(
      IDEMPOTENCY_PREFIX + key,
      JSON.stringify(record),
      'EX',
      IDEMPOTENCY_TTL_SEC,
    );
  }

  // ---------- Storage helpers ----------

  stateKey(id: string): string {
    return `clones/${id}/state.json`;
  }

  assetKey(id: string, assetId: string): string {
    return `clones/${id}/assets/${assetId}`;
  }

  bundleKey(id: string, buildId: string, ext: string): string {
    return `clones/${id}/builds/${buildId}.${ext}`;
  }

  // ---------- Internal ----------

  private async writeCloneMeta(meta: CloneMetadata): Promise<void> {
    const key = JOB_HASH_PREFIX + meta.id;
    const flat = this.serializeMeta(meta);
    await this.redis.hset(key, flat);
  }

  private async writeBuildMeta(meta: BuildMetadata): Promise<void> {
    const key = BUILD_HASH_PREFIX + meta.id;
    const flat = this.serializeBuildMeta(meta);
    await this.redis.hset(key, flat);
  }

  private serializeMeta(meta: CloneMetadata): Record<string, string> {
    const out: Record<string, string> = {
      id: meta.id,
      status: meta.status,
      sourceUrl: meta.sourceUrl,
      options: JSON.stringify(meta.options),
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
      progress: String(meta.progress),
      forms: String(meta.forms),
      links: String(meta.links),
      assets: String(meta.assets),
      bytes: String(meta.bytes),
      etag: meta.etag,
    };
    if (meta.finalUrl) out.finalUrl = meta.finalUrl;
    if (meta.webhookUrl) out.webhookUrl = meta.webhookUrl;
    if (meta.renderedAt) out.renderedAt = meta.renderedAt;
    if (meta.errorCode) out.errorCode = meta.errorCode;
    if (meta.errorMessage) out.errorMessage = meta.errorMessage;
    return out;
  }

  private deserializeMeta(data: Record<string, string>): CloneMetadata {
    const requireField = (k: string): string => {
      const v = data[k];
      if (v === undefined) throw new Error(`Corrupted clone meta: missing ${k}`);
      return v;
    };
    const meta: CloneMetadata = {
      id: requireField('id'),
      status: requireField('status') as CloneStatus,
      sourceUrl: requireField('sourceUrl'),
      options: JSON.parse(requireField('options')) as CloneOptions,
      createdAt: requireField('createdAt'),
      updatedAt: requireField('updatedAt'),
      progress: Number(data.progress ?? 0),
      forms: Number(data.forms ?? 0),
      links: Number(data.links ?? 0),
      assets: Number(data.assets ?? 0),
      bytes: Number(data.bytes ?? 0),
      etag: requireField('etag'),
    };
    if (data.finalUrl) meta.finalUrl = data.finalUrl;
    if (data.webhookUrl) meta.webhookUrl = data.webhookUrl;
    if (data.renderedAt) meta.renderedAt = data.renderedAt;
    if (data.errorCode) meta.errorCode = data.errorCode;
    if (data.errorMessage) meta.errorMessage = data.errorMessage;
    return meta;
  }

  private serializeBuildMeta(meta: BuildMetadata): Record<string, string> {
    const out: Record<string, string> = {
      id: meta.id,
      cloneId: meta.cloneId,
      status: meta.status,
      format: meta.format,
      inlineAssets: meta.inlineAssets ? '1' : '0',
      applyEdits: meta.applyEdits ? '1' : '0',
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
    };
    if (meta.bytes !== undefined) out.bytes = String(meta.bytes);
    if (meta.contentType) out.contentType = meta.contentType;
    if (meta.sha256) out.sha256 = meta.sha256;
    if (meta.filename) out.filename = meta.filename;
    if (meta.storageKey) out.storageKey = meta.storageKey;
    if (meta.expiresAt) out.expiresAt = meta.expiresAt;
    if (meta.errorCode) out.errorCode = meta.errorCode;
    if (meta.errorMessage) out.errorMessage = meta.errorMessage;
    return out;
  }

  private deserializeBuildMeta(data: Record<string, string>): BuildMetadata {
    const requireField = (k: string): string => {
      const v = data[k];
      if (v === undefined) throw new Error(`Corrupted build meta: missing ${k}`);
      return v;
    };
    const meta: BuildMetadata = {
      id: requireField('id'),
      cloneId: requireField('cloneId'),
      status: requireField('status') as BuildMetadata['status'],
      format: requireField('format') as BundleFormat,
      inlineAssets: data.inlineAssets === '1',
      applyEdits: data.applyEdits === '1',
      createdAt: requireField('createdAt'),
      updatedAt: requireField('updatedAt'),
    };
    if (data.bytes) meta.bytes = Number(data.bytes);
    if (data.contentType) meta.contentType = data.contentType;
    if (data.sha256) meta.sha256 = data.sha256;
    if (data.filename) meta.filename = data.filename;
    if (data.storageKey) meta.storageKey = data.storageKey;
    if (data.expiresAt) meta.expiresAt = data.expiresAt;
    if (data.errorCode) meta.errorCode = data.errorCode;
    if (data.errorMessage) meta.errorMessage = data.errorMessage;
    return meta;
  }

  private hashBody(body: unknown): string {
    return createHash('sha256').update(JSON.stringify(body)).digest('hex');
  }

  private computeEtag(seed: { id: string; status: string; updatedAt: string }): string {
    return `"${createHash('sha1').update(`${seed.id}:${seed.status}:${seed.updatedAt}`).digest('hex').slice(0, 16)}"`;
  }
}

export type { BuildJob };
