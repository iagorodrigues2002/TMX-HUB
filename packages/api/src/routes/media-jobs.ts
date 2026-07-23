import { CreateMediaJobBodySchema, type MediaJob } from '@page-cloner/shared';
import archiver from 'archiver';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { ulid } from 'ulid';
import { z } from 'zod';
import { BadRequestError, NotFoundError, zodToProblem } from '../lib/problem.js';

const MAX_INPUT_BYTES = 500 * 1024 * 1024;
const MAX_BULK_ZIP_BYTES = 3 * 1024 * 1024 * 1024;
const BulkDownloadBodySchema = z
  .object({ ids: z.array(z.string().min(1)).min(1).max(100) })
  .strict();
const MIME_BY_EXT: Record<string, string> = {
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  m4v: 'video/x-m4v',
};

function bool(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  return value === '1' || value === 'true';
}

function toWire(job: MediaJob, downloadUrl?: string): Record<string, unknown> {
  return {
    id: job.id,
    status: job.status,
    input: { filename: job.inputFilename, bytes: job.inputBytes },
    options: {
      compression: job.compression,
      aspect_ratio: job.aspectRatio,
      strip_metadata: job.stripMetadata,
      normalize_audio: job.normalizeAudio,
      extension_mode: job.extensionMode,
      target_seconds: job.targetSeconds,
      phase_cancel: job.phaseCancel,
      niche: job.nicheId ? { id: job.nicheId, name: job.nicheName } : undefined,
      white: job.whiteId
        ? { id: job.whiteId, label: job.whiteLabel, volume_db: job.whiteVolumeDb }
        : undefined,
      verify_transcript: job.verifyTranscript,
    },
    output: job.outputFilename
      ? {
          filename: job.outputFilename,
          bytes: job.outputBytes,
          download_url: downloadUrl,
        }
      : undefined,
    transcript: job.transcript,
    transcript_status: job.transcriptStatus,
    transcript_error: job.transcriptError,
    error: job.errorMessage,
    created_at: job.createdAt,
    updated_at: job.updatedAt,
  };
}

const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.post('/media-jobs', async (req, reply) => {
    if (!req.user) throw new BadRequestError('No user attached.');
    if (!req.isMultipart())
      throw new BadRequestError('Envie multipart/form-data com o campo file.');
    const fields: Record<string, string> = {};
    let filePart: import('@fastify/multipart').MultipartFile | undefined;
    for await (const part of req.parts()) {
      if (part.type === 'field' && typeof part.value === 'string')
        fields[part.fieldname] = part.value;
      if (part.type === 'file' && part.fieldname === 'file') {
        filePart = part;
        break;
      }
    }
    if (!filePart) throw new BadRequestError('Campo "file" ausente.');
    const ext = (filePart.filename.split('.').pop() || '').toLowerCase();
    const contentType = MIME_BY_EXT[ext];
    if (!contentType)
      throw new BadRequestError('Formato não suportado. Use MP4, MOV, AVI, WEBM, MKV ou M4V.');

    const parsed = CreateMediaJobBodySchema.safeParse({
      ...(fields.compression ? { compression: fields.compression } : {}),
      ...(fields.aspect_ratio ? { aspect_ratio: fields.aspect_ratio } : {}),
      ...(fields.strip_metadata ? { strip_metadata: bool(fields.strip_metadata) } : {}),
      ...(fields.normalize_audio ? { normalize_audio: bool(fields.normalize_audio) } : {}),
      ...(fields.extension_mode ? { extension_mode: fields.extension_mode } : {}),
      ...(fields.target_seconds ? { target_seconds: Number(fields.target_seconds) } : {}),
      ...(fields.phase_cancel ? { phase_cancel: bool(fields.phase_cancel) } : {}),
      ...(fields.niche_id ? { niche_id: fields.niche_id } : {}),
      ...(fields.white_volume_db ? { white_volume_db: Number(fields.white_volume_db) } : {}),
      ...(fields.verify_transcript ? { verify_transcript: bool(fields.verify_transcript) } : {}),
    });
    if (!parsed.success) throw zodToProblem(parsed.error, req.url);

    let phaseConfig:
      | {
          nicheId: string;
          nicheName: string;
          whiteId: string;
          whiteLabel: string;
          whiteVolumeDb: number;
        }
      | undefined;
    if (parsed.data.phase_cancel && parsed.data.niche_id) {
      const niche = await app.nicheStore.get(parsed.data.niche_id);
      if (niche.whites.length === 0) {
        throw new BadRequestError(`Nicho "${niche.name}" não tem áudio white cadastrado.`);
      }
      const white = app.nicheStore.pickRandomWhite(niche);
      phaseConfig = {
        nicheId: niche.id,
        nicheName: niche.name,
        whiteId: white.id,
        whiteLabel: white.label || white.filename,
        whiteVolumeDb: parsed.data.white_volume_db ?? -22,
      };
    }

    const id = ulid();
    const storageKey = app.mediaJobStore.inputKey(id, ext);
    const upload = await app.storage.putStream(storageKey, filePart.file, {
      contentType,
      maxBytes: MAX_INPUT_BYTES,
    });
    const now = new Date().toISOString();
    const job = await app.mediaJobStore.create({
      id,
      userId: req.user.sub,
      inputStorageKey: storageKey,
      inputFilename: filePart.filename,
      inputBytes: upload.bytes,
      compression: parsed.data.compression ?? 'balanced',
      aspectRatio: parsed.data.aspect_ratio ?? 'original',
      stripMetadata: parsed.data.strip_metadata ?? true,
      normalizeAudio: parsed.data.normalize_audio ?? true,
      extensionMode: parsed.data.extension_mode ?? 'none',
      ...(parsed.data.target_seconds ? { targetSeconds: parsed.data.target_seconds } : {}),
      phaseCancel: parsed.data.phase_cancel ?? false,
      ...(phaseConfig ?? {}),
      verifyTranscript:
        (parsed.data.phase_cancel ?? false) && (parsed.data.verify_transcript ?? false),
      status: 'queued',
      createdAt: now,
      updatedAt: now,
    });
    await app.mediaQueue.add('process-media', { jobId: id }, { jobId: id });
    return reply.code(202).send(toWire(job));
  });

  app.get('/media-jobs', async (req) => {
    if (!req.user) throw new BadRequestError('No user attached.');
    const jobs = await app.mediaJobStore.listByUser(req.user.sub);
    return {
      jobs: await Promise.all(
        jobs.map(async (job) => {
          const url = job.outputStorageKey
            ? await app.storage
                .presignGet(job.outputStorageKey, 24 * 60 * 60, job.outputFilename)
                .catch(() => undefined)
            : undefined;
          return toWire(job, url);
        }),
      ),
    };
  });

  app.post('/media-jobs/bulk-download', async (req, reply) => {
    if (!req.user) throw new BadRequestError('No user attached.');
    const parsed = BulkDownloadBodySchema.safeParse(req.body);
    if (!parsed.success) throw zodToProblem(parsed.error, req.url);

    const jobs = await Promise.all(
      parsed.data.ids.map(async (id) => {
        const job = await app.mediaJobStore.assertOwner(id, req.user!.sub);
        if (job.status !== 'ready' || !job.outputStorageKey) {
          throw new BadRequestError(
            `O vídeo "${job.inputFilename}" ainda não está pronto (status: ${job.status}).`,
          );
        }
        return job;
      }),
    );
    const totalBytes = jobs.reduce((total, job) => total + (job.outputBytes ?? 0), 0);
    if (totalBytes > MAX_BULK_ZIP_BYTES) {
      throw new BadRequestError(
        `A seleção tem ${(totalBytes / 1024 / 1024 / 1024).toFixed(2)}GB. O limite por ZIP é 3GB.`,
      );
    }

    const archive = archiver('zip', { zlib: { level: 6 } });
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    reply.raw.writeHead(200, {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="video-studio-${stamp}.zip"`,
      'cache-control': 'no-store',
    });
    archive.on('error', (error) => {
      app.log.error({ error }, 'media jobs bulk download failed');
      reply.raw.destroy(error);
    });
    archive.pipe(reply.raw);

    const usedNames = new Map<string, number>();
    for (const job of jobs) {
      const object = await app.storage.get(job.outputStorageKey!).catch((error) => {
        throw new NotFoundError(
          `Falha ao ler o resultado de ${job.inputFilename}: ${(error as Error).message}`,
        );
      });
      const originalName = job.outputFilename || `${job.id}.mp4`;
      const duplicateIndex = usedNames.get(originalName) ?? 0;
      let filename = originalName;
      if (duplicateIndex > 0) {
        const dot = originalName.lastIndexOf('.');
        const base = dot > 0 ? originalName.slice(0, dot) : originalName;
        const extension = dot > 0 ? originalName.slice(dot) : '';
        filename = `${base} (${duplicateIndex})${extension}`;
      }
      usedNames.set(originalName, duplicateIndex + 1);
      archive.append(object.body, { name: filename });
    }
    await archive.finalize();
    return reply;
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
