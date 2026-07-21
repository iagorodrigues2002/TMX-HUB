import type { MediaJob, MediaJobStatus } from '@page-cloner/shared';
import type { Redis } from 'ioredis';
import { NotFoundError } from '../lib/problem.js';

const PREFIX = 'media:';
const USER_PREFIX = 'user-media:';

export class MediaJobStore {
  constructor(private readonly redis: Redis) {}

  async create(job: MediaJob): Promise<MediaJob> {
    await this.write(job);
    await this.redis.sadd(this.userKey(job.userId), job.id);
    await this.redis.expire(this.userKey(job.userId), 30 * 24 * 60 * 60);
    return job;
  }

  async get(id: string): Promise<MediaJob> {
    const data = await this.redis.hgetall(this.key(id));
    if (!data || Object.keys(data).length === 0)
      throw new NotFoundError(`Media job not found: ${id}`);
    return this.deserialize(data);
  }

  async listByUser(userId: string): Promise<MediaJob[]> {
    const ids = await this.redis.smembers(this.userKey(userId));
    const jobs = await Promise.all(ids.map((id) => this.get(id).catch(() => null)));
    return jobs
      .filter((job): job is MediaJob => job !== null)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async assertOwner(id: string, userId: string): Promise<MediaJob> {
    const job = await this.get(id);
    if (job.userId !== userId) throw new NotFoundError(`Media job not found: ${id}`);
    return job;
  }

  async setStatus(
    id: string,
    status: MediaJobStatus,
    extra: Partial<MediaJob> = {},
  ): Promise<MediaJob> {
    const current = await this.get(id);
    const next = { ...current, ...extra, status, updatedAt: new Date().toISOString() };
    await this.write(next);
    return next;
  }

  async delete(id: string): Promise<void> {
    const job = await this.get(id).catch(() => null);
    await this.redis.del(this.key(id));
    if (job) await this.redis.srem(this.userKey(job.userId), id);
  }

  inputKey(id: string, ext: string): string {
    return `media/${id}/input.${ext}`;
  }
  outputKey(id: string): string {
    return `media/${id}/output.mp4`;
  }
  private key(id: string): string {
    return `${PREFIX}${id}`;
  }
  private userKey(userId: string): string {
    return `${USER_PREFIX}${userId}`;
  }

  private async write(job: MediaJob): Promise<void> {
    const data: Record<string, string> = {
      id: job.id,
      userId: job.userId,
      inputStorageKey: job.inputStorageKey,
      inputFilename: job.inputFilename,
      inputBytes: String(job.inputBytes),
      compression: job.compression,
      aspectRatio: job.aspectRatio,
      stripMetadata: job.stripMetadata ? '1' : '0',
      normalizeAudio: job.normalizeAudio ? '1' : '0',
      extensionMode: job.extensionMode,
      phaseCancel: job.phaseCancel ? '1' : '0',
      verifyTranscript: job.verifyTranscript ? '1' : '0',
      status: job.status,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
    if (job.targetSeconds !== undefined) data.targetSeconds = String(job.targetSeconds);
    if (job.nicheId) data.nicheId = job.nicheId;
    if (job.nicheName) data.nicheName = job.nicheName;
    if (job.whiteId) data.whiteId = job.whiteId;
    if (job.whiteLabel) data.whiteLabel = job.whiteLabel;
    if (job.whiteVolumeDb !== undefined) data.whiteVolumeDb = String(job.whiteVolumeDb);
    if (job.outputStorageKey) data.outputStorageKey = job.outputStorageKey;
    if (job.outputFilename) data.outputFilename = job.outputFilename;
    if (job.outputBytes !== undefined) data.outputBytes = String(job.outputBytes);
    if (job.transcript) data.transcript = job.transcript;
    if (job.transcriptStatus) data.transcriptStatus = job.transcriptStatus;
    if (job.transcriptError) data.transcriptError = job.transcriptError;
    if (job.errorMessage) data.errorMessage = job.errorMessage;
    await this.redis.hset(this.key(job.id), data);
    await this.redis.expire(this.key(job.id), 7 * 24 * 60 * 60);
  }

  private deserialize(d: Record<string, string>): MediaJob {
    return {
      id: d.id ?? '',
      userId: d.userId ?? '',
      inputStorageKey: d.inputStorageKey ?? '',
      inputFilename: d.inputFilename ?? '',
      inputBytes: Number(d.inputBytes) || 0,
      compression: (d.compression as MediaJob['compression']) ?? 'balanced',
      aspectRatio: (d.aspectRatio as MediaJob['aspectRatio']) ?? 'original',
      stripMetadata: d.stripMetadata === '1',
      normalizeAudio: d.normalizeAudio === '1',
      extensionMode: (d.extensionMode as MediaJob['extensionMode']) ?? 'none',
      ...(d.targetSeconds ? { targetSeconds: Number(d.targetSeconds) } : {}),
      phaseCancel: d.phaseCancel === '1',
      ...(d.nicheId ? { nicheId: d.nicheId } : {}),
      ...(d.nicheName ? { nicheName: d.nicheName } : {}),
      ...(d.whiteId ? { whiteId: d.whiteId } : {}),
      ...(d.whiteLabel ? { whiteLabel: d.whiteLabel } : {}),
      ...(d.whiteVolumeDb ? { whiteVolumeDb: Number(d.whiteVolumeDb) } : {}),
      verifyTranscript: d.verifyTranscript === '1',
      status: (d.status as MediaJobStatus) ?? 'queued',
      ...(d.outputStorageKey ? { outputStorageKey: d.outputStorageKey } : {}),
      ...(d.outputFilename ? { outputFilename: d.outputFilename } : {}),
      ...(d.outputBytes ? { outputBytes: Number(d.outputBytes) } : {}),
      ...(d.transcript ? { transcript: d.transcript } : {}),
      ...(d.transcriptStatus
        ? { transcriptStatus: d.transcriptStatus as MediaJob['transcriptStatus'] }
        : {}),
      ...(d.transcriptError ? { transcriptError: d.transcriptError } : {}),
      ...(d.errorMessage ? { errorMessage: d.errorMessage } : {}),
      createdAt: d.createdAt ?? '',
      updatedAt: d.updatedAt ?? '',
    };
  }
}
