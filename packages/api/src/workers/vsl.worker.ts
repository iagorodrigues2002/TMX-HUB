import { promises as fs } from 'node:fs';
import { Worker } from 'bullmq';
import { logger } from '../lib/logger.js';
import { makeRedis } from '../lib/redis.js';
import { VSL_QUEUE_NAME, type VslJobData } from '../queues/index.js';
import type { StorageService } from '../services/storage.js';
import type { VslJobStore } from '../services/vsl-job-store.js';

interface CoreVslModule {
  detectVideoManifest: (
    url: string,
    opts?: Record<string, unknown>,
  ) => Promise<{
    manifestUrl: string;
    manifestKind: 'hls' | 'dash' | 'mp4';
    finalPageUrl: string;
    headers: Record<string, string>;
    observed: Array<{ url: string; kind: 'hls' | 'dash' | 'mp4' }>;
  }>;
  downloadManifestToFile: (
    manifestUrl: string,
    manifestKind: 'hls' | 'dash' | 'mp4',
    opts?: Record<string, unknown>,
  ) => Promise<{ filePath: string; bytes: number; durationSec?: number }>;
}

async function loadCore(): Promise<CoreVslModule> {
  return (await import('@page-cloner/core')) as unknown as CoreVslModule;
}

function slugFromUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    const host = u.hostname.replace(/^www\./, '');
    const path = u.pathname.replace(/\/+$/, '').replace(/[^a-zA-Z0-9]+/g, '-');
    const base = `${host}${path}`.replace(/\.+/g, '-').toLowerCase();
    return base.replace(/^-+|-+$/g, '') || 'vsl';
  } catch {
    return 'vsl';
  }
}

export function createVslWorker(args: {
  redisUrl: string;
  jobStore: VslJobStore;
  storage: StorageService;
}): Worker<VslJobData> {
  const { redisUrl, jobStore, storage } = args;
  const connection = makeRedis(redisUrl, { maxRetriesPerRequest: null, enableReadyCheck: false });
  const log = logger.child({ component: 'vsl-worker' });

  const worker = new Worker<VslJobData>(
    VSL_QUEUE_NAME,
    async (job) => {
      const { jobId, url } = job.data;
      const jobLog = log.child({ jobId, url });
      jobLog.info('starting vsl job');

      const core = await loadCore();
      let downloadedPath: string | null = null;

      try {
        await jobStore.setStatus(jobId, 'analyzing', { progress: 5 });

        const detection = await core.detectVideoManifest(url, {
          timeoutMs: 90_000,
          onLog: (msg: string) => jobLog.debug({ msg }, 'detect'),
        });

        await jobStore.setStatus(jobId, 'extracting', {
          progress: 25,
          manifestUrl: detection.manifestUrl,
          manifestKind: detection.manifestKind,
        });
        jobLog.info(
          { manifestKind: detection.manifestKind, manifestUrl: detection.manifestUrl },
          'manifest detected',
        );

        await jobStore.setStatus(jobId, 'downloading', { progress: 40 });

        const download = await core.downloadManifestToFile(
          detection.manifestUrl,
          detection.manifestKind,
          {
            timeoutMs: 10 * 60 * 1000,
            maxBytes: 2 * 1024 * 1024 * 1024,
            headers: detection.headers,
            onLog: (line: string) => jobLog.debug({ line }, 'ffmpeg'),
          },
        );
        downloadedPath = download.filePath;

        await jobStore.setStatus(jobId, 'uploading', {
          progress: 85,
          bytes: download.bytes,
          durationSec: download.durationSec,
        });

        const filename = `${slugFromUrl(url)}.mp4`;
        const storageKey = jobStore.videoKey(jobId);

        // Read once into memory and upload. Files up to 2GB; for true scale
        // we'd switch to S3 multipart streaming, but this keeps the MVP simple.
        const body = await fs.readFile(downloadedPath);
        await storage.put(storageKey, body, { contentType: 'video/mp4' });

        await jobStore.setStatus(jobId, 'ready', {
          progress: 100,
          filename,
          storageKey,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        });
        jobLog.info({ bytes: download.bytes, durationSec: download.durationSec }, 'vsl ready');
      } catch (err) {
        const code = (err as { code?: string })?.code ?? 'internal_error';
        const message = err instanceof Error ? err.message : String(err);
        jobLog.error({ err, code }, 'vsl job failed');
        await jobStore.setStatus(jobId, 'failed', {
          errorCode: code,
          errorMessage: message,
          progress: 100,
        });
        throw err;
      } finally {
        if (downloadedPath) {
          await fs.unlink(downloadedPath).catch(() => undefined);
        }
      }
    },
    {
      connection,
      concurrency: 1,
      lockDuration: 15 * 60 * 1000, // bigger than ffmpeg timeout
    },
  );

  worker.on('error', (err) => log.error({ err }, 'vsl worker error'));
  return worker;
}

