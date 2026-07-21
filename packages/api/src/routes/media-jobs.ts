import { ulid } from 'ulid';
import { CreateMediaJobBodySchema, type MediaJob } from '@page-cloner/shared';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { BadRequestError, zodToProblem } from '../lib/problem.js';

const MAX_INPUT_BYTES = 500 * 1024 * 1024;
const MIME_BY_EXT: Record<string, string> = {
  mp4: 'video/mp4', mov: 'video/quicktime', avi: 'video/x-msvideo',
  webm: 'video/webm', mkv: 'video/x-matroska', m4v: 'video/x-m4v',
};

function bool(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  return value === '1' || value === 'true';
}

function toWire(job: MediaJob, downloadUrl?: string): Record<string, unknown> {
  return {
    id: job.id, status: job.status,
    input: { filename: job.inputFilename, bytes: job.inputBytes },
    options: {
      compression: job.compression, aspect_ratio: job.aspectRatio,
      strip_metadata: job.stripMetadata, normalize_audio: job.normalizeAudio,
      extension_mode: job.extensionMode, target_seconds: job.targetSeconds,
    },
    output: job.outputFilename ? {
      filename: job.outputFilename, bytes: job.outputBytes, download_url: downloadUrl,
    } : undefined,
    error: job.errorMessage, created_at: job.createdAt, updated_at: job.updatedAt,
  };
}

const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.post('/media-jobs', async (req, reply) => {
    if (!req.user) throw new BadRequestError('No user attached.');
    if (!req.isMultipart()) throw new BadRequestError('Envie multipart/form-data com o campo file.');
    const fields: Record<string, string> = {};
    let filePart: import('@fastify/multipart').MultipartFile | undefined;
    for await (const part of req.parts()) {
      if (part.type === 'field' && typeof part.value === 'string') fields[part.fieldname] = part.value;
      if (part.type === 'file' && part.fieldname === 'file') { filePart = part; break; }
    }
    if (!filePart) throw new BadRequestError('Campo "file" ausente.');
    const ext = (filePart.filename.split('.').pop() || '').toLowerCase();
    const contentType = MIME_BY_EXT[ext];
    if (!contentType) throw new BadRequestError('Formato não suportado. Use MP4, MOV, AVI, WEBM, MKV ou M4V.');

    const parsed = CreateMediaJobBodySchema.safeParse({
      ...(fields.compression ? { compression: fields.compression } : {}),
      ...(fields.aspect_ratio ? { aspect_ratio: fields.aspect_ratio } : {}),
      ...(fields.strip_metadata ? { strip_metadata: bool(fields.strip_metadata) } : {}),
      ...(fields.normalize_audio ? { normalize_audio: bool(fields.normalize_audio) } : {}),
      ...(fields.extension_mode ? { extension_mode: fields.extension_mode } : {}),
      ...(fields.target_seconds ? { target_seconds: Number(fields.target_seconds) } : {}),
    });
    if (!parsed.success) throw zodToProblem(parsed.error, req.url);

    const id = ulid();
    const storageKey = app.mediaJobStore.inputKey(id, ext);
    const upload = await app.storage.putStream(storageKey, filePart.file, {
      contentType, maxBytes: MAX_INPUT_BYTES,
    });
    const now = new Date().toISOString();
    const job = await app.mediaJobStore.create({
      id, userId: req.user.sub, inputStorageKey: storageKey,
      inputFilename: filePart.filename, inputBytes: upload.bytes,
      compression: parsed.data.compression ?? 'balanced',
      aspectRatio: parsed.data.aspect_ratio ?? 'original',
      stripMetadata: parsed.data.strip_metadata ?? true,
      normalizeAudio: parsed.data.normalize_audio ?? true,
      extensionMode: parsed.data.extension_mode ?? 'none',
      ...(parsed.data.target_seconds ? { targetSeconds: parsed.data.target_seconds } : {}),
      status: 'queued', createdAt: now, updatedAt: now,
    });
    await app.mediaQueue.add('process-media', { jobId: id }, { jobId: id });
    return reply.code(202).send(toWire(job));
  });

  app.get('/media-jobs', async (req) => {
    if (!req.user) throw new BadRequestError('No user attached.');
    const jobs = await app.mediaJobStore.listByUser(req.user.sub);
    return { jobs: await Promise.all(jobs.map(async (job) => {
      const url = job.outputStorageKey
        ? await app.storage.presignGet(job.outputStorageKey, 24 * 60 * 60, job.outputFilename).catch(() => undefined)
        : undefined;
      return toWire(job, url);
    })) };
  });

  app.get<{ Params: { id: string } }>('/media-jobs/:id', async (req) => {
    if (!req.user) throw new BadRequestError('No user attached.');
    const job = await app.mediaJobStore.assertOwner(req.params.id, req.user.sub);
    const url = job.outputStorageKey
      ? await app.storage.presignGet(job.outputStorageKey, 24 * 60 * 60, job.outputFilename)
      : undefined;
    return toWire(job, url);
  });

  app.delete<{ Params: { id: string } }>('/media-jobs/:id', async (req, reply) => {
    if (!req.user) throw new BadRequestError('No user attached.');
    const job = await app.mediaJobStore.assertOwner(req.params.id, req.user.sub);
    await app.storage.deletePrefix(`media/${job.id}/`).catch(() => {});
    await app.mediaJobStore.delete(job.id);
    return reply.code(204).send();
  });
};

export default plugin;
