import type { CloneState } from '@page-cloner/shared';
import { Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import { env } from '../env.js';
import { logger } from '../lib/logger.js';
import { RENDER_QUEUE_NAME, type RenderJobData } from '../queues/index.js';
import type { JobStore } from '../services/job-store.js';
import type { StorageService } from '../services/storage.js';
import { fireWebhook } from '../services/webhook.js';

// Minimal type surface for the in-progress @page-cloner/core package. We use
// a dynamic import so this module typechecks even when core has no dist yet.
interface CoreModule {
  fetchPage(
    url: string,
    opts: Record<string, unknown>,
  ): Promise<{ html: string; finalUrl: string; statusCode: number }>;
  sanitize(
    html: string,
    opts: Record<string, unknown>,
  ): Promise<{ html: string; removed: Record<string, number> }>;
  resolveAssets(
    html: string,
    baseUrl: string,
    opts: Record<string, unknown>,
  ): Promise<{
    html: string;
    assets: {
      entries: Array<{
        id: string;
        url: string;
        mime: string;
        size: number;
        storageKey?: string;
        data?: Buffer;
      }>;
      byUrl: Record<string, string>;
    };
  }>;
  extractForms(html: string): CloneState['forms'];
  extractLinks(html: string): CloneState['links'];
}

async function loadCore(): Promise<CoreModule> {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-expect-error - core dist may not be present at type-check time.
  return (await import('@page-cloner/core')) as CoreModule;
}

export function createRenderWorker(args: {
  connection: Redis;
  jobStore: JobStore;
  storage: StorageService;
}): Worker<RenderJobData> {
  const { connection, jobStore, storage } = args;
  const log = logger.child({ component: 'render-worker' });

  const worker = new Worker<RenderJobData>(
    RENDER_QUEUE_NAME,
    async (job) => {
      const { jobId, url, webhookUrl } = job.data;
      const jobLog = log.child({ jobId, url });
      jobLog.info('starting render job');

      const core = await loadCore();
      const meta = await jobStore.getCloneMeta(jobId);

      try {
        await withTimeout(
          (async () => {
            // 1. Fetch
            await jobStore.setCloneStatus(jobId, 'rendering', { progress: 10 });
            const fetched = await core.fetchPage(url, {
              renderMode: meta.options.renderMode,
              userAgent: meta.options.userAgent,
              viewport: meta.options.viewport,
              timeoutMs: env.MAX_RENDER_TIMEOUT_MS,
            });

            // 2. Sanitize
            await jobStore.setCloneStatus(jobId, 'sanitizing', { progress: 35 });
            const sanitized = await core.sanitize(fetched.html, {
              removeTracking: true,
              stripTemplates: true,
            });

            // 3. Resolve assets (download enabled)
            await jobStore.setCloneStatus(jobId, 'resolving_assets', { progress: 60 });
            const resolved = await core.resolveAssets(sanitized.html, fetched.finalUrl, {
              download: true,
              maxBytes: env.MAX_ASSET_BYTES,
              rewriteHtml: true,
            });

            // 4. Upload assets to S3
            for (const entry of resolved.assets.entries) {
              if (entry.data && Buffer.isBuffer(entry.data)) {
                await storage.put(jobStore.assetKey(jobId, entry.id), entry.data, {
                  contentType: entry.mime,
                  cacheControl: 'public, max-age=31536000, immutable',
                });
                entry.storageKey = jobStore.assetKey(jobId, entry.id);
              }
            }

            // 5. Extract forms + links
            const forms = core.extractForms(resolved.html);
            const links = core.extractLinks(resolved.html);

            const totalBytes =
              Buffer.byteLength(resolved.html, 'utf-8') +
              resolved.assets.entries.reduce((sum, a) => sum + a.size, 0);

            const state: CloneState = {
              jobId,
              sourceUrl: url,
              finalUrl: fetched.finalUrl,
              status: 'ready',
              html: resolved.html,
              assets: {
                entries: resolved.assets.entries.map((e) => ({
                  id: e.id,
                  url: e.url,
                  originalUrl: e.url,
                  kind: 'other',
                  mime: e.mime,
                  size: e.size,
                  hash: '',
                  ...(e.storageKey ? { storageKey: e.storageKey } : {}),
                })),
                byUrl: resolved.assets.byUrl,
              },
              forms,
              links,
              createdAt: meta.createdAt,
              updatedAt: new Date().toISOString(),
            };
            await jobStore.saveCloneState(state);

            await jobStore.setCloneStatus(jobId, 'ready', {
              progress: 100,
              finalUrl: fetched.finalUrl,
              forms: forms.length,
              links: links.length,
              assets: resolved.assets.entries.length,
              bytes: totalBytes,
              renderedAt: new Date().toISOString(),
            });
            jobLog.info(
              { forms: forms.length, links: links.length, assets: resolved.assets.entries.length },
              'render complete',
            );
          })(),
          env.MAX_RENDER_TIMEOUT_MS + 5_000,
          'render_timeout',
        );

        if (webhookUrl) {
          const finalMeta = await jobStore.getCloneMeta(jobId);
          await fireWebhook(webhookUrl, {
            id: finalMeta.id,
            status: finalMeta.status,
            url: finalMeta.sourceUrl,
            ...(finalMeta.finalUrl ? { final_url: finalMeta.finalUrl } : {}),
            created_at: finalMeta.createdAt,
            updated_at: finalMeta.updatedAt,
          });
        }
      } catch (err) {
        const code = classifyError(err);
        const message = err instanceof Error ? err.message : String(err);
        jobLog.error({ err, code }, 'render failed');
        await jobStore.setCloneStatus(jobId, 'failed', {
          errorCode: code,
          errorMessage: message,
          progress: 100,
        });
        if (webhookUrl) {
          const failedMeta = await jobStore.getCloneMeta(jobId);
          await fireWebhook(webhookUrl, {
            id: failedMeta.id,
            status: failedMeta.status,
            url: failedMeta.sourceUrl,
            error: { code, message },
            created_at: failedMeta.createdAt,
            updated_at: failedMeta.updatedAt,
          });
        }
        throw err;
      }
    },
    {
      connection,
      concurrency: 2,
      lockDuration: env.MAX_RENDER_TIMEOUT_MS + 30_000,
    },
  );

  worker.on('error', (err) => log.error({ err }, 'render worker error'));
  return worker;
}

async function withTimeout<T>(promise: Promise<T>, ms: number, code: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`Operation timed out after ${ms}ms`) as Error & { code?: string };
      err.code = code;
      reject(err);
    }, ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function classifyError(err: unknown): string {
  if (
    typeof err === 'object' &&
    err &&
    'code' in err &&
    typeof (err as { code?: unknown }).code === 'string'
  ) {
    const code = (err as { code: string }).code;
    if (
      code === 'render_timeout' ||
      code === 'dns_failure' ||
      code === 'tls_error' ||
      code === 'http_error' ||
      code === 'too_large' ||
      code === 'sanitization_failed'
    ) {
      return code;
    }
  }
  return 'internal_error';
}
