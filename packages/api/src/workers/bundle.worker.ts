import { createHash } from 'node:crypto';
import type { CloneState, Form } from '@page-cloner/shared';
import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { logger } from '../lib/logger.js';
import { BUNDLE_QUEUE_NAME, type BundleJobData } from '../queues/index.js';
import type { JobStore } from '../services/job-store.js';
import type { StorageService } from '../services/storage.js';

interface CoreBundleModule {
  bundle(state: CloneState, opts: Record<string, unknown>): Promise<Buffer>;
}

async function loadCore(): Promise<CoreBundleModule> {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-expect-error - core dist may not be present at type-check time.
  return (await import('@page-cloner/core')) as CoreBundleModule;
}

export function createBundleWorker(args: {
  redisUrl: string;
  jobStore: JobStore;
  storage: StorageService;
}): Worker<BundleJobData> {
  const { redisUrl, jobStore, storage } = args;
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null, enableReadyCheck: false });
  const log = logger.child({ component: 'bundle-worker' });

  const worker = new Worker<BundleJobData>(
    BUNDLE_QUEUE_NAME,
    async (job) => {
      const { jobId, buildId } = job.data;
      const buildLog = log.child({ jobId, buildId });
      buildLog.info('starting bundle job');

      const buildMeta = await jobStore.getBuildMeta(buildId);
      try {
        await jobStore.updateBuild(buildId, { status: 'building' });

        const state = await jobStore.getCloneState(jobId);
        const core = await loadCore();

        // Apply edits to the state before bundling.
        const edited = buildMeta.applyEdits ? applyEdits(state) : state;

        const buffer: Buffer = await core.bundle(edited, {
          format: buildMeta.format,
          inlineAssets: buildMeta.inlineAssets,
          applyEdits: buildMeta.applyEdits,
        });

        const ext = buildMeta.format === 'zip' ? 'zip' : 'html';
        const contentType = buildMeta.format === 'zip' ? 'application/zip' : 'text/html';
        const filename = `${slugFromUrl(state.sourceUrl)}.${ext}`;
        const key = jobStore.bundleKey(jobId, buildId, ext);
        const sha256 = createHash('sha256').update(buffer).digest('hex');

        await storage.put(key, buffer, { contentType });

        await jobStore.updateBuild(buildId, {
          status: 'ready',
          bytes: buffer.length,
          contentType,
          sha256,
          filename,
          storageKey: key,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        });

        buildLog.info({ bytes: buffer.length, sha256 }, 'bundle complete');
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        buildLog.error({ err }, 'bundle failed');
        await jobStore.updateBuild(buildId, {
          status: 'failed',
          errorCode: 'internal_error',
          errorMessage: message,
        });
        throw err;
      }
    },
    {
      connection,
      concurrency: 4,
    },
  );

  worker.on('error', (err) => log.error({ err }, 'bundle worker error'));
  return worker;
}

// Materialize the user's edits onto the CloneState so core.bundle()
// emits the final, edited DOM.
function applyEdits(state: CloneState): CloneState {
  return { ...state, forms: state.forms.map(rewriteForm), links: [...state.links] };
}

function rewriteForm(form: Form): Form {
  switch (form.mode) {
    case 'replace':
      return { ...form, currentAction: form.currentAction || form.originalAction };
    case 'capture_redirect':
      return { ...form };
    case 'disable':
      return { ...form, currentAction: 'about:blank' };
    default:
      return { ...form, currentAction: form.originalAction };
  }
}

function slugFromUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    const host = u.hostname.replace(/^www\./, '');
    const path = u.pathname.replace(/\/+$/, '').replace(/[^a-zA-Z0-9]+/g, '-');
    const base = `${host}${path}`.replace(/\.+/g, '-').toLowerCase();
    return base.replace(/^-+|-+$/g, '') || 'clone';
  } catch {
    return 'clone';
  }
}
