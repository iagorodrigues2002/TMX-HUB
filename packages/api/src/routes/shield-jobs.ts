import { ulid } from 'ulid';
import { CreateShieldJobBodySchema } from '@page-cloner/shared';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { isValidUlid } from '../lib/ids.js';
import { BadRequestError, zodToProblem } from '../lib/problem.js';
import type { ShieldJob } from '@page-cloner/shared';

const ALLOWED_VIDEO = new Set([
  'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm', 'video/x-matroska',
  // Allow audio-only too — the worker still applies phase-cancel to the audio.
  'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/m4a', 'audio/x-m4a',
  'audio/aac', 'audio/mp4',
]);

const MAX_INPUT_BYTES = 100 * 1024 * 1024; // 100MB

function jobToWire(j: ShieldJob, downloadUrl?: string): Record<string, unknown> {
  return {
    id: j.id,
    status: j.status,
    niche: { id: j.nicheId, name: j.nicheName },
    white: { id: j.whiteId, label: j.whiteLabel, volume_db: j.whiteVolumeDb },
    compression: j.compression,
    verify_transcript: j.verifyTranscript,
    input: { filename: j.inputFilename, bytes: j.inputBytes },
    output:
      j.status === 'ready' && j.outputFilename
        ? {
            filename: j.outputFilename,
            bytes: j.outputBytes,
            download_url: downloadUrl,
          }
        : undefined,
    transcript: j.transcript,
    transcript_status: j.transcriptStatus,
    error: j.errorMessage,
    created_at: j.createdAt,
    updated_at: j.updatedAt,
  };
}

function extFromMime(mime: string, fallbackName: string): string {
  if (mime === 'video/mp4' || mime === 'audio/mp4') return 'mp4';
  if (mime === 'video/quicktime') return 'mov';
  if (mime === 'video/x-msvideo') return 'avi';
  if (mime === 'video/webm') return 'webm';
  if (mime === 'video/x-matroska') return 'mkv';
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3';
  if (mime.includes('wav')) return 'wav';
  if (mime.includes('m4a') || mime.includes('aac')) return 'm4a';
  const fallback = (fallbackName.split('.').pop() || 'mp4').toLowerCase();
  return fallback.replace(/[^a-z0-9]/g, '') || 'mp4';
}

const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  // POST /v1/shield-jobs
  // multipart/form-data:
  //   - file: the input video/audio
  //   - niche_id: required
  //   - white_volume_db: optional number, default -22
  //   - compression: 'none' | 'lossless' | 'balanced' | 'small', default 'none'
  //   - verify_transcript: '1' | 'true' to enable
  app.post('/shield-jobs', async (req, reply) => {
    if (!req.user) throw new BadRequestError('No user attached.');
    if (!req.isMultipart()) {
      throw new BadRequestError('Send multipart/form-data with the video file + form fields.');
    }

    const fields: Record<string, string> = {};
    let filePart: import('@fastify/multipart').MultipartFile | undefined;

    for await (const part of req.parts()) {
      if (part.type === 'field') {
        if (typeof part.value === 'string') fields[part.fieldname] = part.value;
        continue;
      }
      if (part.type === 'file' && part.fieldname === 'file') {
        filePart = part;
        break;
      }
    }
    if (!filePart) throw new BadRequestError('Missing "file" field.');

    const mime = (filePart.mimetype || '').toLowerCase();
    if (!ALLOWED_VIDEO.has(mime)) {
      throw new BadRequestError(`Tipo não suportado: ${mime}. Aceitos: mp4, mov, avi, webm, mkv, mp3, wav, m4a.`);
    }

    // Parse + validate body fields.
    const parsedBody = CreateShieldJobBodySchema.safeParse({
      niche_id: fields.niche_id,
      ...(fields.white_volume_db ? { white_volume_db: Number(fields.white_volume_db) } : {}),
      ...(fields.compression ? { compression: fields.compression } : {}),
      ...(fields.verify_transcript
        ? { verify_transcript: fields.verify_transcript === '1' || fields.verify_transcript === 'true' }
        : {}),
    });
    if (!parsedBody.success) throw zodToProblem(parsedBody.error, req.url);

    // Validate niche + pick a random white.
    const niche = await app.nicheStore.assertOwner(parsedBody.data.niche_id, req.user.sub);
    if (niche.whites.length === 0) {
      throw new BadRequestError(
        `Nicho "${niche.name}" não tem nenhum áudio white cadastrado. Adicione pelo menos um.`,
      );
    }
    const picked = app.nicheStore.pickRandomWhite(niche);

    // Stream upload to R2.
    const jobId = ulid();
    const ext = extFromMime(mime, filePart.filename);
    const storageKey = app.shieldJobStore.inputKey(jobId, ext);

    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of filePart.file) {
      total += chunk.length;
      if (total > MAX_INPUT_BYTES) {
        throw new BadRequestError(
          `Arquivo excede o limite de ${MAX_INPUT_BYTES / (1024 * 1024)}MB.`,
        );
      }
      chunks.push(chunk);
    }
    if (filePart.file.truncated) {
      throw new BadRequestError('Upload truncado pelo limite de tamanho.');
    }
    const buf = Buffer.concat(chunks);
    await app.storage.put(storageKey, buf, { contentType: mime });

    const job = await app.shieldJobStore.create({
      id: jobId,
      userId: req.user.sub,
      inputStorageKey: storageKey,
      inputFilename: filePart.filename,
      inputBytes: buf.length,
      nicheId: niche.id,
      nicheName: niche.name,
      whiteId: picked.id,
      whiteLabel: picked.label || picked.filename,
      whiteVolumeDb: parsedBody.data.white_volume_db ?? -22,
      compression: parsedBody.data.compression ?? 'none',
      verifyTranscript: parsedBody.data.verify_transcript ?? false,
    });

    await app.shieldQueue.add('shield', { jobId }, { jobId });

    return reply.code(202).send(jobToWire(job));
  });

  // GET /v1/shield-jobs/:id
  app.get<{ Params: { id: string } }>('/shield-jobs/:id', async (req, reply) => {
    if (!req.user) throw new BadRequestError('No user attached.');
    const { id } = req.params;
    if (!isValidUlid(id)) throw new BadRequestError('Invalid job id.');
    const job = await app.shieldJobStore.assertOwner(id, req.user.sub);
    let downloadUrl: string | undefined;
    if (job.status === 'ready' && job.outputStorageKey) {
      downloadUrl = await app.storage.presignGet(
        job.outputStorageKey,
        24 * 60 * 60,
        job.outputFilename,
      );
    }
    return reply.send(jobToWire(job, downloadUrl));
  });

  // DELETE /v1/shield-jobs/:id — cleanup
  app.delete<{ Params: { id: string } }>('/shield-jobs/:id', async (req, reply) => {
    if (!req.user) throw new BadRequestError('No user attached.');
    const job = await app.shieldJobStore.assertOwner(req.params.id, req.user.sub);
    await app.storage.delete(job.inputStorageKey).catch(() => undefined);
    if (job.outputStorageKey) {
      await app.storage.delete(job.outputStorageKey).catch(() => undefined);
    }
    await app.shieldJobStore.delete(job.id);
    return reply.code(204).send();
  });
};

export default plugin;
