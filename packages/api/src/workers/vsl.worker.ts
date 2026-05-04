import { promises as fs } from 'node:fs';
import { Worker } from 'bullmq';
import { logger } from '../lib/logger.js';
import { makeRedis } from '../lib/redis.js';
import { VSL_QUEUE_NAME, type VslJobData } from '../queues/index.js';
import type { StorageService } from '../services/storage.js';
import type { VslJobStore } from '../services/vsl-job-store.js';

interface DetectResult {
  manifestUrl: string;
  manifestKind: 'hls' | 'dash' | 'mp4';
  finalPageUrl: string;
  headers: Record<string, string>;
  observed: Array<{ url: string; kind: string; source: string }>;
}

interface CoreVslModule {
  detectBothManifests: (
    url: string,
    opts?: Record<string, unknown>,
  ) => Promise<{
    cloakerDetected: boolean;
    black?: DetectResult;
    white?: DetectResult;
    shared?: DetectResult;
    errors: { paid?: string; organic?: string };
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
      const tempPaths: string[] = [];

      try {
        await jobStore.setStatus(jobId, 'analyzing', { progress: 5 });

        // Run paid + organic probes in parallel to detect cloaker.
        const probe = await core.detectBothManifests(url, {
          timeoutMs: 90_000,
          onLog: (msg: string) => jobLog.debug({ msg }, 'detect'),
        });

        const black = probe.black ?? probe.shared;
        const white = probe.white;
        if (!black) {
          throw Object.assign(new Error('No manifest detected for paid traffic.'), {
            code: 'manifest_not_found',
          });
        }

        await jobStore.setStatus(jobId, 'extracting', {
          progress: 25,
          manifestUrl: black.manifestUrl,
          manifestKind: black.manifestKind,
          cloakerDetected: probe.cloakerDetected,
          ...(probe.cloakerDetected && white
            ? { whiteManifestUrl: white.manifestUrl }
            : {}),
        });
        jobLog.info(
          {
            manifestKind: black.manifestKind,
            blackManifest: black.manifestUrl,
            whiteManifest: white?.manifestUrl,
            cloakerDetected: probe.cloakerDetected,
          },
          'manifest(s) detected',
        );

        await jobStore.setStatus(jobId, 'downloading', { progress: 40 });

        // Download black (always) and white (only if cloaker detected) in parallel.
        const downloadJobs: Array<Promise<{
          variant: 'black' | 'white';
          filePath: string;
          bytes: number;
          durationSec?: number;
        }>> = [];

        downloadJobs.push(
          core
            .downloadManifestToFile(black.manifestUrl, black.manifestKind, {
              timeoutMs: 10 * 60 * 1000,
              maxBytes: 2 * 1024 * 1024 * 1024,
              headers: black.headers,
              onLog: (line: string) => jobLog.debug({ line, variant: 'black' }, 'ffmpeg'),
            })
            .then((r) => ({ variant: 'black' as const, ...r })),
        );

        if (probe.cloakerDetected && white) {
          downloadJobs.push(
            core
              .downloadManifestToFile(white.manifestUrl, white.manifestKind, {
                timeoutMs: 10 * 60 * 1000,
                maxBytes: 2 * 1024 * 1024 * 1024,
                headers: white.headers,
                onLog: (line: string) => jobLog.debug({ line, variant: 'white' }, 'ffmpeg'),
              })
              .then((r) => ({ variant: 'white' as const, ...r })),
          );
        }

        const results = await Promise.all(downloadJobs);
        for (const r of results) tempPaths.push(r.filePath);

        const blackResult = results.find((r) => r.variant === 'black')!;
        const whiteResult = results.find((r) => r.variant === 'white');

        await jobStore.setStatus(jobId, 'uploading', {
          progress: 85,
          bytes: blackResult.bytes,
          durationSec: blackResult.durationSec,
          ...(whiteResult ? { whiteBytes: whiteResult.bytes } : {}),
        });

        const slug = slugFromUrl(url);
        const blackFilename = `${slug}.mp4`;
        const blackKey = jobStore.videoKey(jobId);
        const blackBody = await fs.readFile(blackResult.filePath);
        await storage.put(blackKey, blackBody, { contentType: 'video/mp4' });

        const patch: Parameters<typeof jobStore.setStatus>[2] = {
          progress: 100,
          filename: blackFilename,
          storageKey: blackKey,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        };

        if (whiteResult) {
          const whiteFilename = `${slug}-white.mp4`;
          const whiteKey = jobStore.whiteVideoKey(jobId);
          const whiteBody = await fs.readFile(whiteResult.filePath);
          await storage.put(whiteKey, whiteBody, { contentType: 'video/mp4' });
          patch.whiteFilename = whiteFilename;
          patch.whiteStorageKey = whiteKey;
        }

        await jobStore.setStatus(jobId, 'ready', patch);
        jobLog.info(
          {
            blackBytes: blackResult.bytes,
            whiteBytes: whiteResult?.bytes,
            cloakerDetected: probe.cloakerDetected,
          },
          'vsl ready',
        );
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
        for (const p of tempPaths) {
          await fs.unlink(p).catch(() => undefined);
        }
      }
    },
    {
      connection,
      concurrency: 1,
      lockDuration: 20 * 60 * 1000,
    },
  );

  worker.on('error', (err) => log.error({ err }, 'vsl worker error'));
  return worker;
}
