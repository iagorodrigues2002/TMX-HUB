import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Worker } from 'bullmq';
import type { MediaJob } from '@page-cloner/shared';
import { logger } from '../lib/logger.js';
import { makeRedis } from '../lib/redis.js';
import { MEDIA_QUEUE_NAME, type MediaJobData } from '../queues/index.js';
import type { MediaJobStore } from '../services/media-job-store.js';
import type { StorageService } from '../services/storage.js';

function videoFilter(job: MediaJob): string[] {
  const filters: string[] = [];
  const dimensions: Record<MediaJob['aspectRatio'], [number, number] | null> = {
    original: null, '9:16': [1080, 1920], '4:5': [1080, 1350], '1:1': [1080, 1080],
  };
  const target = dimensions[job.aspectRatio];
  if (target) {
    const [w, h] = target;
    filters.push(`scale=${w}:${h}:force_original_aspect_ratio=decrease`);
    filters.push(`pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:black`);
  }
  if (job.extensionMode === 'freeze' && job.targetSeconds) {
    filters.push(`tpad=stop_mode=clone:stop_duration=${job.targetSeconds}`);
  }
  return filters;
}

function runFfmpeg(job: MediaJob, input: string, output: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = ['-y', '-hide_banner', '-loglevel', 'warning'];
    if (job.extensionMode === 'loop') args.push('-stream_loop', '-1');
    args.push('-i', input);
    if (job.targetSeconds && job.extensionMode !== 'none') args.push('-t', String(job.targetSeconds));
    const vf = videoFilter(job);
    if (vf.length > 0) args.push('-vf', vf.join(','));
    const crf = job.compression === 'small' ? '28' : job.compression === 'balanced' ? '23' : '18';
    args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', crf, '-pix_fmt', 'yuv420p');
    if (job.normalizeAudio) args.push('-af', 'loudnorm=I=-16:LRA=11:TP=-1.5');
    args.push('-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart');
    if (job.stripMetadata) args.push('-map_metadata', '-1', '-map_chapters', '-1');
    args.push(output);
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', reject);
    proc.on('close', (code) => code === 0 ? resolve() : reject(new Error(stderr.slice(-2_000))));
  });
}

export function createMediaWorker(args: {
  redisUrl: string; jobStore: MediaJobStore; storage: StorageService;
}): Worker<MediaJobData> {
  const log = logger.child({ component: 'media-worker' });
  return new Worker<MediaJobData>(MEDIA_QUEUE_NAME, async (queueJob) => {
    const { jobId } = queueJob.data;
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), `media-${jobId}-`));
    const input = path.join(dir, 'input');
    const output = path.join(dir, 'output.mp4');
    try {
      const job = await args.jobStore.get(jobId);
      await args.jobStore.setStatus(jobId, 'processing');
      const object = await args.storage.get(job.inputStorageKey);
      await fs.writeFile(input, object.body);
      await runFfmpeg(job, input, output);
      const body = await fs.readFile(output);
      const outputKey = args.jobStore.outputKey(jobId);
      await args.storage.put(outputKey, body, { contentType: 'video/mp4' });
      const base = job.inputFilename.replace(/\.[^.]+$/, '');
      await args.jobStore.setStatus(jobId, 'ready', {
        outputStorageKey: outputKey, outputFilename: `${base}_creative.mp4`, outputBytes: body.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error({ error, jobId }, 'media job failed');
      await args.jobStore.setStatus(jobId, 'failed', { errorMessage: message }).catch(() => {});
      throw error;
    } finally {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }, {
    connection: makeRedis(args.redisUrl, { maxRetriesPerRequest: null, enableReadyCheck: false }),
    concurrency: 2,
  });
}
