import { CreateFunnelJobRequestSchema } from '@page-cloner/shared';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { ulid } from 'ulid';
import { isValidUlid } from '../lib/ids.js';
import { BadRequestError, zodToProblem } from '../lib/problem.js';
import type { FunnelJobMetadata } from '../services/funnel-job-store.js';

function toWire(meta: FunnelJobMetadata, downloadUrl?: string) {
  return {
    id: meta.id,
    root_url: meta.rootUrl,
    status: meta.status,
    progress: meta.progress,
    max_depth: meta.maxDepth,
    max_pages: meta.maxPages,
    pages: meta.pages,
    total_bytes: meta.totalBytes,
    filename: meta.filename,
    storage_key: meta.storageKey,
    expires_at: meta.expiresAt,
    download_url: downloadUrl,
    error: meta.errorCode
      ? { code: meta.errorCode, message: meta.errorMessage ?? '' }
      : undefined,
    created_at: meta.createdAt,
    updated_at: meta.updatedAt,
  };
}

const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.post('/funnel-jobs', async (req, reply) => {
    const parsed = CreateFunnelJobRequestSchema.safeParse(req.body);
    if (!parsed.success) throw zodToProblem(parsed.error, req.url);

    const id = ulid();
    const meta = await app.funnelJobStore.create({
      id,
      url: parsed.data.url,
      maxDepth: parsed.data.max_depth,
      maxPages: parsed.data.max_pages,
    });
    await app.funnelQueue.add('funnel', { jobId: id, url: parsed.data.url }, { jobId: id });

    if (req.user) {
      await app.activityStore.record(req.user.sub, {
        kind: 'funnel',
        id,
        label: parsed.data.url,
        status: meta.status,
        createdAt: meta.createdAt,
      });
    }

    return reply.code(202).send(toWire(meta));
  });

  app.get<{ Params: { id: string } }>('/funnel-jobs/:id', async (req, reply) => {
    const { id } = req.params;
    if (!isValidUlid(id)) throw new BadRequestError('Invalid job id format.');
    const meta = await app.funnelJobStore.get(id);
    let downloadUrl: string | undefined;
    if (meta.status === 'ready' && meta.storageKey) {
      downloadUrl = await app.storage.presignGet(meta.storageKey, 60 * 60, meta.filename);
    }
    return reply.send(toWire(meta, downloadUrl));
  });
};

export default plugin;
