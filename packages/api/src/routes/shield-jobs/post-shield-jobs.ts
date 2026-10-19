import { CreateShieldJobBodySchema } from '@page-cloner/shared';
import archiver from 'archiver';
import type { FastifyInstance } from 'fastify';
import { ulid } from 'ulid';
import { isValidUlid } from '../../lib/ids.js';
import {
  type ListPaginationQuery,
  paginateItems,
  parseListPagination,
} from '../../lib/pagination.js';
import { BadRequestError, NotFoundError, zodToProblem } from '../../lib/problem.js';
import {
  BulkDownloadBodySchema,
  MAX_BULK_ZIP_BYTES,
  MAX_INPUT_BYTES,
  extFromMime,
  jobToWire,
  resolveMime,
} from './bulk-download-body-schema.js';

export function registerPostShieldJobsRoutes(app: FastifyInstance) {
  // POST /v1/shield-jobs
  // multipart/form-data:
  //   - file: the input video/audio
  //   - niche_id: required only when use_white_audio is enabled
  //   - use_white_audio: optional boolean, default true
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

    const declaredMime = (filePart.mimetype || '').toLowerCase();
    const mime = resolveMime(declaredMime, filePart.filename);
    if (!mime) {
      req.log.warn(
        {
          filename: filePart.filename,
          declaredMime,
        },
        'shield-jobs: mime/ext não reconhecido',
      );
      throw new BadRequestError(
        `Tipo não suportado pra "${filePart.filename}" (mime="${declaredMime || 'vazio'}"). Aceitos: mp4, mov, avi, webm, mkv, mp3, wav, m4a, aac.`,
      );
    }

    // Parse + validate body fields.
    const parsedBody = CreateShieldJobBodySchema.safeParse({
      niche_id: fields.niche_id,
      ...(fields.use_white_audio
        ? { use_white_audio: fields.use_white_audio === '1' || fields.use_white_audio === 'true' }
        : {}),
      ...(fields.white_volume_db ? { white_volume_db: Number(fields.white_volume_db) } : {}),
      ...(fields.compression ? { compression: fields.compression } : {}),
      ...(fields.verify_transcript
        ? {
            verify_transcript:
              fields.verify_transcript === '1' || fields.verify_transcript === 'true',
          }
        : {}),
    });
    if (!parsedBody.success) throw zodToProblem(parsedBody.error, req.url);

    const useWhiteAudio = parsedBody.data.use_white_audio ?? true;
    let nicheId = '';
    let nicheName = 'Sem nicho';
    let whiteId = '';
    let whiteLabel = 'Sem áudio white';

    if (useWhiteAudio) {
      if (!parsedBody.data.niche_id) {
        throw new BadRequestError('Selecione um nicho para usar áudio white.');
      }
      const niche = await app.nicheStore.assertAccess(
        parsedBody.data.niche_id,
        req.user.sub,
        req.user.role === 'admin',
      );
      if (niche.whites.length === 0) {
        throw new BadRequestError(
          `Nicho "${niche.name}" não tem nenhum áudio white cadastrado. Adicione pelo menos um.`,
        );
      }
      const picked = app.nicheStore.pickRandomWhite(niche);
      nicheId = niche.id;
      nicheName = niche.name;
      whiteId = picked.id;
      whiteLabel = picked.label || picked.filename;
    }

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
      nicheId,
      nicheName,
      whiteId,
      whiteLabel,
      whiteVolumeDb: parsedBody.data.white_volume_db ?? -22,
      useWhiteAudio,
      compression: parsedBody.data.compression ?? 'none',
      verifyTranscript: parsedBody.data.verify_transcript ?? false,
    });

    await app.shieldQueue.add('shield', { jobId }, { jobId });

    return reply.code(202).send(jobToWire(job));
  });

  // GET /v1/shield-jobs — list user's recent jobs (last 30d)
  app.get<{ Querystring: ListPaginationQuery }>('/shield-jobs', async (req, reply) => {
    if (!req.user) throw new BadRequestError('No user attached.');
    const jobs = await app.shieldJobStore.listByUser(req.user.sub);
    const page = paginateItems(jobs, parseListPagination(req.query));
    // Generate presigned URLs for ready jobs (parallel).
    const wired = await Promise.all(
      page.items.map(async (j) => {
        if (j.status === 'ready' && j.outputStorageKey) {
          const url = await app.storage
            .presignGet(j.outputStorageKey, 24 * 60 * 60, j.outputFilename)
            .catch(() => undefined);
          return jobToWire(j, url);
        }
        return jobToWire(j);
      }),
    );
    return reply.send({ jobs: wired, pagination: page.pagination });
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
          throw new BadRequestError(`Job ${id} não está pronto (status: ${j.status}).`);
        }
        return j;
      }),
    );
    if (jobs.length === 0) throw new BadRequestError('Nenhum job válido.');

    // Cap total de bytes — o ZIP vira um blob na memória do browser; passar de 3GB
    // estoura na maioria dos navegadores. Soma usa outputBytes salvo no job.
    const totalBytes = jobs.reduce((acc, j) => acc + (j.outputBytes ?? 0), 0);
    if (totalBytes > MAX_BULK_ZIP_BYTES) {
      const totalGb = (totalBytes / 1024 / 1024 / 1024).toFixed(2);
      throw new BadRequestError(
        `Seleção tem ${totalGb}GB; limite de download em lote é 3GB. Divida em rodadas menores.`,
      );
    }

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
}
