import { ulid } from 'ulid';
import {
  CreateNicheRequestSchema,
  UpdateNicheRequestSchema,
} from '@page-cloner/shared';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { BadRequestError, NotFoundError, zodToProblem } from '../lib/problem.js';
import type { Niche, NicheWhite } from '@page-cloner/shared';

const ALLOWED_AUDIO = new Set([
  'audio/mpeg', 'audio/mp3',
  'audio/wav', 'audio/x-wav',
  'audio/m4a', 'audio/x-m4a', 'audio/aac', 'audio/mp4',
  'audio/ogg', 'audio/webm',
]);

const MAX_WHITE_BYTES = 20 * 1024 * 1024; // 20 MB per white audio

function nicheToWire(n: Niche): Record<string, unknown> {
  return {
    id: n.id,
    name: n.name,
    description: n.description,
    whites: n.whites.map(whiteToWire),
    created_at: n.createdAt,
    updated_at: n.updatedAt,
  };
}

function whiteToWire(w: NicheWhite): Record<string, unknown> {
  return {
    id: w.id,
    filename: w.filename,
    bytes: w.bytes,
    label: w.label,
    created_at: w.createdAt,
  };
}

function extFromMime(mime: string, fallback: string): string {
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3';
  if (mime.includes('wav')) return 'wav';
  if (mime.includes('m4a') || mime.includes('aac') || mime === 'audio/mp4') return 'm4a';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('webm')) return 'webm';
  return fallback || 'mp3';
}

const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  // GET /v1/niches — list user's niches
  app.get('/niches', async (req, reply) => {
    if (!req.user) throw new BadRequestError('No user attached.');
    const niches = await app.nicheStore.listByUser(req.user.sub);
    return reply.send({ niches: niches.map(nicheToWire) });
  });

  // POST /v1/niches — create
  app.post('/niches', async (req, reply) => {
    if (!req.user) throw new BadRequestError('No user attached.');
    const parsed = CreateNicheRequestSchema.safeParse(req.body);
    if (!parsed.success) throw zodToProblem(parsed.error, req.url);
    const niche = await app.nicheStore.create({
      userId: req.user.sub,
      name: parsed.data.name,
      ...(parsed.data.description ? { description: parsed.data.description } : {}),
    });
    return reply.code(201).send(nicheToWire(niche));
  });

  // PATCH /v1/niches/:id
  app.patch<{ Params: { id: string } }>('/niches/:id', async (req, reply) => {
    if (!req.user) throw new BadRequestError('No user attached.');
    const parsed = UpdateNicheRequestSchema.safeParse(req.body);
    if (!parsed.success) throw zodToProblem(parsed.error, req.url);
    const updated = await app.nicheStore.update(req.params.id, req.user.sub, parsed.data);
    return reply.send(nicheToWire(updated));
  });

  // DELETE /v1/niches/:id — also wipes any uploaded white objects in R2.
  app.delete<{ Params: { id: string } }>('/niches/:id', async (req, reply) => {
    if (!req.user) throw new BadRequestError('No user attached.');
    const niche = await app.nicheStore.delete(req.params.id, req.user.sub);
    for (const w of niche.whites) {
      await app.storage.delete(w.storageKey).catch(() => undefined);
    }
    return reply.code(204).send();
  });

  // POST /v1/niches/:id/whites — upload a single audio file (multipart/form-data, field "file").
  // Optional form field "label" sets a friendly name.
  app.post<{ Params: { id: string } }>('/niches/:id/whites', async (req, reply) => {
    if (!req.user) throw new BadRequestError('No user attached.');
    if (!req.isMultipart()) {
      throw new BadRequestError('Send the audio as multipart/form-data with field "file".');
    }
    // Owner check up-front so we don't waste time streaming the upload.
    await app.nicheStore.assertOwner(req.params.id, req.user.sub);

    let label: string | undefined;
    let filePart: import('@fastify/multipart').MultipartFile | undefined;

    for await (const part of req.parts()) {
      if (part.type === 'field') {
        if (part.fieldname === 'label' && typeof part.value === 'string') {
          label = part.value.trim().slice(0, 60) || undefined;
        }
        continue;
      }
      if (part.type === 'file' && part.fieldname === 'file') {
        filePart = part;
        break; // we'll consume the stream below
      }
    }

    if (!filePart) {
      throw new BadRequestError('Missing "file" field in upload.');
    }
    const mime = (filePart.mimetype || '').toLowerCase();
    if (!ALLOWED_AUDIO.has(mime)) {
      throw new BadRequestError(
        `Tipo de áudio não suportado: ${mime || 'desconhecido'}. Use mp3, wav, m4a, ogg ou webm.`,
      );
    }

    const whiteId = ulid();
    const ext = extFromMime(mime, (filePart.filename.split('.').pop() || 'mp3').toLowerCase());
    const storageKey = `niches/${req.user.sub}/${req.params.id}/whites/${whiteId}.${ext}`;

    const result = await app.storage.putStream(storageKey, filePart.file, {
      contentType: mime,
      maxBytes: MAX_WHITE_BYTES,
    });
    if (filePart.file.truncated) {
      await app.storage.delete(storageKey).catch(() => {});
      throw new BadRequestError('Upload truncado pelo limite de tamanho.');
    }

    const { niche } = await app.nicheStore.addWhite(req.params.id, req.user.sub, {
      filename: filePart.filename,
      storageKey,
      bytes: result.bytes,
      ...(label ? { label } : {}),
    });
    return reply.code(201).send(nicheToWire(niche));
  });

  // DELETE /v1/niches/:id/whites/:whiteId
  app.delete<{ Params: { id: string; whiteId: string } }>(
    '/niches/:id/whites/:whiteId',
    async (req, reply) => {
      if (!req.user) throw new BadRequestError('No user attached.');
      const niche = await app.nicheStore.assertOwner(req.params.id, req.user.sub);
      const white = niche.whites.find((w) => w.id === req.params.whiteId);
      if (!white) throw new NotFoundError(`White não encontrado: ${req.params.whiteId}`);
      await app.storage.delete(white.storageKey).catch(() => undefined);
      const next = await app.nicheStore.removeWhite(req.params.id, req.user.sub, req.params.whiteId);
      return reply.send(nicheToWire(next));
    },
  );
};

export default plugin;
