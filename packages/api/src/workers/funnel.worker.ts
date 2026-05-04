import { Worker } from 'bullmq';
import archiver from 'archiver';
import { PassThrough } from 'node:stream';
import type { FunnelPage } from '@page-cloner/shared';
import { logger } from '../lib/logger.js';
import { makeRedis } from '../lib/redis.js';
import { FUNNEL_QUEUE_NAME, type FunnelJobData } from '../queues/index.js';
import type { StorageService } from '../services/storage.js';
import type { FunnelJobStore } from '../services/funnel-job-store.js';

interface DiscoveredStep {
  url: string;
  label: string;
  source: string;
  score: number;
}

interface CoreFunnelModule {
  fetchPage(
    url: string,
    opts: Record<string, unknown>,
  ): Promise<{ html: string; finalUrl: string; statusCode: number }>;
  sanitize(
    html: string,
    opts: Record<string, unknown>,
  ): { html: string; removed: Record<string, number> };
  discoverNextSteps(html: string, baseUrl: string): DiscoveredStep[];
}

async function loadCore(): Promise<CoreFunnelModule> {
  return (await import('@page-cloner/core')) as unknown as CoreFunnelModule;
}

function slug(input: string, fallback: string): string {
  const s = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return s || fallback;
}

function pageFolderName(index: number, page: FunnelPage): string {
  const idx = String(index + 1).padStart(2, '0');
  let pathSlug = 'root';
  try {
    const u = new URL(page.url);
    pathSlug = slug(u.pathname || '/', 'root');
  } catch {
    pathSlug = slug(page.url, 'page');
  }
  return `${idx}-${pathSlug}`;
}

function buildIndexHtml(rootUrl: string, pages: FunnelPage[]): string {
  const rows = pages
    .map((p, i) => {
      const folder = pageFolderName(i, p);
      const safeUrl = (p.finalUrl ?? p.url).replace(/&/g, '&amp;').replace(/</g, '&lt;');
      const safeLabel = (p.label || '(sem label)')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;');
      const errBadge = p.error
        ? `<span style="color:#f87171;margin-left:8px">⚠ ${p.error}</span>`
        : '';
      return `
      <tr>
        <td>${i + 1}</td>
        <td>${p.depth}</td>
        <td>${safeLabel}${errBadge}</td>
        <td><code>${safeUrl}</code></td>
        <td>${p.bytes ? Math.round(p.bytes / 1024) + ' KB' : '—'}</td>
        <td>${p.error ? '—' : `<a href="./${folder}/index.html">abrir</a>`}</td>
      </tr>`;
    })
    .join('');

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Funnel Clone — ${rootUrl}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      background: #04101A; color: #e2e8f0; margin: 0; padding: 32px; }
    h1 { color: #22D3EE; margin: 0 0 8px 0; font-size: 22px; }
    .meta { color: #94a3b8; font-size: 13px; margin-bottom: 24px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 10px 12px; border-bottom: 1px solid rgba(255,255,255,0.08); text-align: left; }
    th { color: #94a3b8; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em;
      font-size: 11px; background: rgba(255,255,255,0.02); }
    a { color: #22D3EE; text-decoration: none; }
    a:hover { text-decoration: underline; }
    code { font-family: ui-monospace, "SF Mono", monospace; font-size: 11px; color: #cbd5e1;
      background: rgba(255,255,255,0.04); padding: 2px 6px; border-radius: 3px; }
  </style>
</head>
<body>
  <h1>▌ TMX HUB · Funnel Clone</h1>
  <p class="meta">Root: <code>${rootUrl}</code> · ${pages.length} página(s) descoberta(s)</p>
  <table>
    <thead>
      <tr><th>#</th><th>Depth</th><th>Label</th><th>URL</th><th>Tamanho</th><th>Abrir</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;
}

export function createFunnelWorker(args: {
  redisUrl: string;
  jobStore: FunnelJobStore;
  storage: StorageService;
}): Worker<FunnelJobData> {
  const { redisUrl, jobStore, storage } = args;
  const connection = makeRedis(redisUrl, { maxRetriesPerRequest: null, enableReadyCheck: false });
  const log = logger.child({ component: 'funnel-worker' });

  const worker = new Worker<FunnelJobData>(
    FUNNEL_QUEUE_NAME,
    async (job) => {
      const { jobId } = job.data;
      const meta = await jobStore.get(jobId);
      const jobLog = log.child({ jobId, root: meta.rootUrl });
      jobLog.info({ maxDepth: meta.maxDepth, maxPages: meta.maxPages }, 'starting funnel clone');

      const core = await loadCore();
      const visited = new Set<string>();
      const queue: Array<{ url: string; depth: number; label: string }> = [
        { url: meta.rootUrl, depth: 0, label: 'Front' },
      ];
      const results: Array<{ page: FunnelPage; html: string }> = [];

      try {
        await jobStore.setStatus(jobId, 'crawling', { progress: 5 });

        while (queue.length > 0 && results.length < meta.maxPages) {
          const next = queue.shift();
          if (!next) break;
          const norm = next.url.replace(/#.*$/, '');
          if (visited.has(norm)) continue;
          visited.add(norm);

          const pageIndex = results.length;
          const pageEntry: FunnelPage = {
            url: norm,
            depth: next.depth,
            index: pageIndex,
            label: next.label,
          };
          jobLog.info({ url: norm, depth: next.depth, index: pageIndex }, 'crawling page');

          let html = '';
          try {
            const fetched = await core.fetchPage(norm, {
              renderMode: 'js',
              timeoutMs: 60_000,
            });
            const sanitized = core.sanitize(fetched.html, { removeTracking: true });
            html = sanitized.html;
            pageEntry.bytes = Buffer.byteLength(html, 'utf-8');
            pageEntry.finalUrl = fetched.finalUrl;
            // Extract <title> as a better label fallback.
            const titleMatch = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
            const title = titleMatch?.[1]?.trim();
            if (title && next.label === 'Front' && next.depth === 0) {
              pageEntry.label = title;
            } else if (!pageEntry.label && title) {
              pageEntry.label = title;
            }
          } catch (err) {
            pageEntry.error = err instanceof Error ? err.message : String(err);
            jobLog.warn({ err, url: norm }, 'page failed');
          }

          results.push({ page: pageEntry, html });
          await jobStore.appendPage(jobId, pageEntry);

          // Re-read meta for progress (others may have updated it).
          const totalEstimate = Math.min(meta.maxPages, queue.length + results.length);
          const progress = Math.min(80, 5 + Math.floor((results.length / totalEstimate) * 70));
          await jobStore.update(jobId, { progress });

          // Discover next steps if we have HTML and aren't at max depth.
          if (html && next.depth < meta.maxDepth) {
            const candidates = core.discoverNextSteps(html, pageEntry.finalUrl ?? norm);
            jobLog.info(
              {
                page: norm,
                candidates: candidates.length,
                scores: candidates.slice(0, 10).map((c) => ({
                  s: c.score,
                  src: c.source,
                  url: c.url,
                })),
              },
              'discovered candidates',
            );
            // Looser threshold (0.4) + bigger fan-out (10/page). Trades a
            // few false positives for better recall — a back-redirect or
            // low-CTA-text "ENTRAR" button needs to make it through.
            const top = candidates.filter((c) => c.score >= 0.4).slice(0, 10);
            for (const c of top) {
              const cnorm = c.url.replace(/#.*$/, '');
              if (visited.has(cnorm)) continue;
              if (queue.some((q) => q.url === cnorm)) continue;
              queue.push({ url: cnorm, depth: next.depth + 1, label: c.label });
            }
          }
        }

        // Package into ZIP.
        await jobStore.setStatus(jobId, 'packaging', { progress: 85 });

        const archive = archiver('zip', { zlib: { level: 9 } });
        const passThrough = new PassThrough();
        archive.pipe(passThrough);
        const chunks: Buffer[] = [];
        passThrough.on('data', (c) => chunks.push(Buffer.from(c)));
        const done = new Promise<void>((resolve, reject) => {
          passThrough.on('end', () => resolve());
          passThrough.on('error', reject);
          archive.on('error', reject);
        });

        for (const { page, html } of results) {
          if (!html) continue;
          const folder = pageFolderName(page.index, page);
          archive.append(html, { name: `${folder}/index.html` });
        }
        archive.append(buildIndexHtml(meta.rootUrl, results.map((r) => r.page)), {
          name: 'index.html',
        });
        await archive.finalize();
        await done;

        const zipBuf = Buffer.concat(chunks);

        await jobStore.setStatus(jobId, 'uploading', { progress: 95 });

        const storageKey = jobStore.zipKey(jobId);
        await storage.put(storageKey, zipBuf, { contentType: 'application/zip' });

        let host = 'funnel';
        try {
          host = new URL(meta.rootUrl).hostname.replace(/^www\./, '');
        } catch {
          // ignore
        }
        const filename = `${slug(host, 'funnel')}-funnel.zip`;

        await jobStore.setStatus(jobId, 'ready', {
          progress: 100,
          totalBytes: zipBuf.length,
          filename,
          storageKey,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        });
        jobLog.info({ pages: results.length, zipBytes: zipBuf.length }, 'funnel clone done');
      } catch (err) {
        const code = (err as { code?: string })?.code ?? 'internal_error';
        const message = err instanceof Error ? err.message : String(err);
        jobLog.error({ err, code }, 'funnel clone failed');
        await jobStore.setStatus(jobId, 'failed', {
          errorCode: code,
          errorMessage: message,
          progress: 100,
        });
        throw err;
      }
    },
    {
      connection,
      concurrency: 1,
      lockDuration: 30 * 60 * 1000,
    },
  );

  worker.on('error', (err) => log.error({ err }, 'funnel worker error'));
  return worker;
}
