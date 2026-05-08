import archiver from 'archiver';
import { ulid } from 'ulid';
import { CreateShieldJobBodySchema } from '@page-cloner/shared';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { isValidUlid } from '../lib/ids.js';
import { BadRequestError, NotFoundError, zodToProblem } from '../lib/problem.js';
import type { ShieldJob } from '@page-cloner/shared';

const BulkDownloadBodySchema = z
  .object({ ids: z.array(z.string().min(1)).min(1).max(100) })
  .strict();

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
    transcript_error: j.transcriptError,
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

    // Stream upload pra R2 com multipart paralelo (4 parts simultâneas, 5MB cada).
    // Não buffera o arquivo inteiro em memória; parts vão pra R2 enquanto o
    // resto do request ainda chega — ~2-3x mais rápido que put + buffer.
    const jobId = ulid();
    const ext = extFromMime(mime, filePart.filename);
    const storageKey = app.shieldJobStore.inputKey(jobId, ext);

    const result = await app.storage.putStream(storageKey, filePart.file, {
      contentType: mime,
      maxBytes: MAX_INPUT_BYTES,
    });
    if (filePart.file.truncated) {
      // Limpa o objeto parcial em caso do multipart cap do fastify ter cortado.
      await app.storage.delete(storageKey).catch(() => {});
      throw new BadRequestError('Upload truncado pelo limite de tamanho.');
    }

    const job = await app.shieldJobStore.create({
      id: jobId,
      userId: req.user.sub,
      inputStorageKey: storageKey,
      inputFilename: filePart.filename,
      inputBytes: result.bytes,
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

  // GET /v1/shield-jobs — list user's recent jobs (last 30d)
  app.get('/shield-jobs', async (req, reply) => {
    if (!req.user) throw new BadRequestError('No user attached.');
    const jobs = await app.shieldJobStore.listByUser(req.user.sub);
    // Generate presigned URLs for ready jobs (parallel).
    const wired = await Promise.all(
      jobs.map(async (j) => {
        if (j.status === 'ready' && j.outputStorageKey) {
          const url = await app.storage
            .presignGet(j.outputStorageKey, 24 * 60 * 60, j.outputFilename)
            .catch(() => undefined);
          return jobToWire(j, url);
        }
        return jobToWire(j);
      }),
    );
    return reply.send({ jobs: wired });
  });

  // POST /v1/shield-jobs/bulk-download — stream zip with selected ready outputs
  app.post('/shield-jobs/bulk-download', async (req, reply) => {
    if (!req.user) throw new BadRequestError('No user attached.');
    const parsed = BulkDownloadBodySchema.safeParse(req.body);
    if (!parsed.success) throw zodToProblem(parsed.error, req.url);
    const userId = req.user.sub;

    // Validar todos pertencem ao user e estão ready, em paralelo.
    const jobs = await Promise.all(
      parsed.data.ids.map(async (id) => {
        const j = await app.shieldJobStore.assertOwner(id, userId);
        if (j.status !== 'ready' || !j.outputStorageKey) {
          throw new BadRequestError(
            `Job ${id} não está pronto (status: ${j.status}).`,
          );
        }
        return j;
      }),
    );
    if (jobs.length === 0) throw new BadRequestError('Nenhum job válido.');

    const archive = archiver('zip', { zlib: { level: 6 } });
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const zipName = `shield-batch-${stamp}.zip`;

    reply.raw.writeHead(200, {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="${zipName}"`,
      'cache-control': 'no-store',
    });
    archive.on('error', (err) => {
      app.log.error({ err }, 'shield bulk-download archiver error');
      try {
        reply.raw.destroy(err);
      } catch {}
    });
    archive.pipe(reply.raw);

    // Append each output as it arrives. Dedup nomes em caso de colisão.
    const used = new Map<string, number>();
    for (const j of jobs) {
      const obj = await app.storage.get(j.outputStorageKey!).catch((e) => {
        throw new NotFoundError(`Falha ao ler output do job ${j.id}: ${(e as Error).message}`);
      });
      let name = j.outputFilename || `${j.id}.mp4`;
      const count = used.get(name) ?? 0;
      if (count > 0) {
        const dot = name.lastIndexOf('.');
        const base = dot > 0 ? name.slice(0, dot) : name;
        const ext = dot > 0 ? name.slice(dot) : '';
        name = `${base} (${count})${ext}`;
      }
      used.set(j.outputFilename || `${j.id}.mp4`, count + 1);
      archive.append(obj.body, { name });
    }
    await archive.finalize();
    return reply;
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
