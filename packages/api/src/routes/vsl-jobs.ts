import { CreateVslJobRequestSchema } from '@page-cloner/shared';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { ulid } from 'ulid';
import { isValidUlid } from '../lib/ids.js';
import { BadRequestError, zodToProblem } from '../lib/problem.js';

const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  // POST /v1/vsl-jobs — create a new job and enqueue it
  app.post('/vsl-jobs', async (req, reply) => {
    const parsed = CreateVslJobRequestSchema.safeParse(req.body);
    if (!parsed.success) throw zodToProblem(parsed.error, req.url);

    const id = ulid();
    const meta = await app.vslJobStore.create({ id, url: parsed.data.url });

    await app.vslQueue.add('vsl', { jobId: id, url: parsed.data.url }, { jobId: id });

    if (req.user) {
      await app.activityStore.record(req.user.sub, {
        kind: 'vsl',
        id,
        label: parsed.data.url,
        status: meta.status,
        createdAt: meta.createdAt,
      });
    }

    return reply.code(202).send(toWire(meta, app.storage));
  });

  // GET /v1/vsl-jobs/:id — poll status
  app.get<{ Params: { id: string } }>('/vsl-jobs/:id', async (req, reply) => {
    const { id } = req.params;
    if (!isValidUlid(id)) throw new BadRequestError('Invalid job id format.');
    const meta = await app.vslJobStore.get(id);

    // Surface presigned download URLs only when ready.
    let downloadUrl: string | undefined;
    let whiteDownloadUrl: string | undefined;
    if (meta.status === 'ready') {
      if (meta.storageKey) {
        downloadUrl = await app.storage.presignGet(meta.storageKey, 60 * 60, meta.filename);
      }
      if (meta.whiteStorageKey) {
        whiteDownloadUrl = await app.storage.presignGet(
          meta.whiteStorageKey,
          60 * 60,
          meta.whiteFilename,
        );
      }
    }

    return reply.send({
      ...toWire(meta, app.storage),
      download_url: downloadUrl,
      white_download_url: whiteDownloadUrl,
    });
  });
};

import type { StorageService } from '../services/storage.js';
import type { VslJobMetadata } from '../services/vsl-job-store.js';

function toWire(meta: VslJobMetadata, _storage: StorageService): Record<string, unknown> {
  return {
    id: meta.id,
    url: meta.url,
    status: meta.status,
    progress: meta.progress,
    manifest_url: meta.manifestUrl,
    manifest_kind: meta.manifestKind,
    bytes: meta.bytes,
    duration_sec: meta.durationSec,
    filename: meta.filename,
    storage_key: meta.storageKey,
    expires_at: meta.expiresAt,
    cloaker_detected: meta.cloakerDetected,
    white_manifest_url: meta.whiteManifestUrl,
    white_filename: meta.whiteFilename,
    white_storage_key: meta.whiteStorageKey,
    white_bytes: meta.whiteBytes,
    error: meta.errorCode
      ? { code: meta.errorCode, message: meta.errorMessage ?? '' }
      : undefined,
    created_at: meta.createdAt,
    updated_at: meta.updatedAt,
  };
}

export default plugin;
