import type { Redis } from 'ioredis';
import type {
  ShieldCompressionMode,
  ShieldJob,
  ShieldJobStatus,
  ShieldVerifyStatus,
} from '@page-cloner/shared';
import { NotFoundError } from '../lib/problem.js';

const SHIELD_PREFIX = 'shield:';

export class ShieldJobStore {
  constructor(private readonly redis: Redis) {}

  async create(args: {
    id: string;
    userId: string;
    inputStorageKey: string;
    inputFilename: string;
    inputBytes: number;
    nicheId: string;
    nicheName: string;
    whiteId: string;
    whiteLabel: string;
    whiteVolumeDb: number;
    compression: ShieldCompressionMode;
    verifyTranscript: boolean;
  }): Promise<ShieldJob> {
    const now = new Date().toISOString();
    const job: ShieldJob = {
      id: args.id,
      userId: args.userId,
      inputStorageKey: args.inputStorageKey,
      inputFilename: args.inputFilename,
      inputBytes: args.inputBytes,
      nicheId: args.nicheId,
      nicheName: args.nicheName,
      whiteId: args.whiteId,
      whiteLabel: args.whiteLabel,
      whiteVolumeDb: args.whiteVolumeDb,
      compression: args.compression,
      verifyTranscript: args.verifyTranscript,
      status: 'queued',
      ...(args.verifyTranscript ? { transcriptStatus: 'pending' as ShieldVerifyStatus } : {}),
      createdAt: now,
      updatedAt: now,
    };
    await this.write(job);
    return job;
  }

  async get(id: string): Promise<ShieldJob> {
    const data = await this.redis.hgetall(this.key(id));
    if (!data || Object.keys(data).length === 0) {
      throw new NotFoundError(`Shield job not found: ${id}`);
    }
    return this.deserialize(data);
  }

  async update(id: string, patch: Partial<ShieldJob>): Promise<ShieldJob> {
    const current = await this.get(id);
    const next: ShieldJob = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    await this.write(next);
    return next;
  }

  async setStatus(
    id: string,
    status: ShieldJobStatus,
    extra: Partial<ShieldJob> = {},
  ): Promise<ShieldJob> {
    return this.update(id, { ...extra, status });
  }

  async assertOwner(id: string, userId: string): Promise<ShieldJob> {
    const job = await this.get(id);
    if (job.userId !== userId) throw new NotFoundError(`Shield job not found: ${id}`);
    return job;
  }

  async delete(id: string): Promise<void> {
    await this.redis.del(this.key(id));
  }

  inputKey(id: string, ext: string): string {
    return `shield/${id}/input.${ext.replace(/^\./, '')}`;
  }
  outputKey(id: string): string {
    return `shield/${id}/output.mp4`;
  }

  private key(id: string): string {
    return `${SHIELD_PREFIX}${id}`;
  }

  private async write(job: ShieldJob): Promise<void> {
    await this.redis.hset(this.key(job.id), this.serialize(job));
    // Auto-expire job metadata after 7 days; storage has its own lifecycle.
    await this.redis.expire(this.key(job.id), 7 * 24 * 60 * 60);
  }

  private serialize(j: ShieldJob): Record<string, string> {
    const out: Record<string, string> = {
      id: j.id,
      userId: j.userId,
      inputStorageKey: j.inputStorageKey,
      inputFilename: j.inputFilename,
      inputBytes: String(j.inputBytes),
      nicheId: j.nicheId,
      nicheName: j.nicheName,
      whiteId: j.whiteId,
      whiteLabel: j.whiteLabel,
      whiteVolumeDb: String(j.whiteVolumeDb),
      compression: j.compression,
      verifyTranscript: j.verifyTranscript ? '1' : '0',
      status: j.status,
      createdAt: j.createdAt,
      updatedAt: j.updatedAt,
    };
    if (j.outputStorageKey) out.outputStorageKey = j.outputStorageKey;
    if (j.outputFilename) out.outputFilename = j.outputFilename;
    if (j.outputBytes !== undefined) out.outputBytes = String(j.outputBytes);
    if (j.transcript) out.transcript = j.transcript;
    if (j.transcriptStatus) out.transcriptStatus = j.transcriptStatus;
    if (j.errorMessage) out.errorMessage = j.errorMessage;
    return out;
  }

  private deserialize(d: Record<string, string>): ShieldJob {
    return {
      id: d.id ?? '',
      userId: d.userId ?? '',
      inputStorageKey: d.inputStorageKey ?? '',
      inputFilename: d.inputFilename ?? '',
      inputBytes: Number(d.inputBytes) || 0,
      nicheId: d.nicheId ?? '',
      nicheName: d.nicheName ?? '',
      whiteId: d.whiteId ?? '',
      whiteLabel: d.whiteLabel ?? '',
      whiteVolumeDb: Number(d.whiteVolumeDb) || -22,
      compression: (d.compression as ShieldCompressionMode) || 'none',
      verifyTranscript: d.verifyTranscript === '1',
      status: (d.status as ShieldJobStatus) || 'queued',
      ...(d.outputStorageKey ? { outputStorageKey: d.outputStorageKey } : {}),
      ...(d.outputFilename ? { outputFilename: d.outputFilename } : {}),
      ...(d.outputBytes ? { outputBytes: Number(d.outputBytes) } : {}),
      ...(d.transcript ? { transcript: d.transcript } : {}),
      ...(d.transcriptStatus
        ? { transcriptStatus: d.transcriptStatus as ShieldVerifyStatus }
        : {}),
      ...(d.errorMessage ? { errorMessage: d.errorMessage } : {}),
      createdAt: d.createdAt ?? '',
      updatedAt: d.updatedAt ?? '',
    };
  }
}
