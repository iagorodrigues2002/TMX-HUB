import type { CloneOptions } from '@page-cloner/shared';
import { CloneOptionsSchema, CreateCloneRequestSchema } from '@page-cloner/shared';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { isValidUlid, newJobId } from '../lib/ids.js';
import { BadRequestError, ConflictError, zodToProblem } from '../lib/problem.js';
import type { CloneMetadata } from '../services/job-store.js';

function metaToCloneJob(meta: CloneMetadata): Record<string, unknown> {
  const job: Record<string, unknown> = {
    id: meta.id,
    status: meta.status,
    url: meta.sourceUrl,
    progress: meta.progress,
    options: optionsToSnake(meta.options),
    created_at: meta.createdAt,
    updated_at: meta.updatedAt,
    links: {
      self: `/v1/clones/${meta.id}`,
      preview: `/v1/clones/${meta.id}/preview`,
      forms: `/v1/clones/${meta.id}/forms`,
      links_collection: `/v1/clones/${meta.id}/links`,
    },
  };
  if (meta.finalUrl) job.final_url = meta.finalUrl;
  if (meta.webhookUrl) job.webhook_url = meta.webhookUrl;
  if (meta.renderedAt) job.rendered_at = meta.renderedAt;
  if (meta.status === 'ready') {
    job.counts = {
      forms: meta.forms,
      links: meta.links,
      assets: meta.assets,
      bytes: meta.bytes,
    };
  }
  if (meta.errorCode && meta.errorMessage) {
    job.error = { code: meta.errorCode, message: meta.errorMessage };
  }
  return job;
}

function optionsToSnake(options: CloneOptions): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(options as Record<string, unknown>)) {
    if (v === undefined) continue;
    out[snake(k)] = v;
  }
  return out;
}

function snake(s: string): string {
  return s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

// Inbound JSON uses snake_case but our schemas use camelCase; coerce.
// Fields supported by the OpenAPI spec that the shared CloneOptions schema
// does not yet model; we drop them silently so .strict() doesn't reject.
const UNSUPPORTED_OPTION_KEYS = new Set(['timeoutMs', 'waitFor', 'blockThirdParty']);

function camelizeCreateRequest(body: unknown): unknown {
  if (!body || typeof body !== 'object') return body;
  const b = body as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(b)) {
    if (k === 'webhook_url') continue;
    out[k] = v;
  }
  if ('webhook_url' in b && b.webhook_url) {
    const opts = (out.options as Record<string, unknown>) ?? {};
    out.options = { ...opts, webhookUrl: b.webhook_url };
  }
  if (out.options && typeof out.options === 'object') {
    const o = out.options as Record<string, unknown>;
    const camel: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) {
      const camelKey = k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
      if (UNSUPPORTED_OPTION_KEYS.has(camelKey)) continue;
      camel[camelKey] = v;
    }
    out.options = camel;
  }
  return out;
}

const IdParamSchema = z.object({ id: z.string() });

const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  // POST /v1/clones — enqueue a clone job
  app.post('/clones', async (req, reply) => {
    const idemKey = req.headers['idempotency-key'];
    const idempotencyKey =
      typeof idemKey === 'string' && idemKey.length > 0 && idemKey.length <= 128 ? idemKey : null;

    const camelBody = camelizeCreateRequest(req.body);
    const parsed = CreateCloneRequestSchema.safeParse(camelBody);
    if (!parsed.success) throw zodToProblem(parsed.error, req.url);

    const options = CloneOptionsSchema.parse(parsed.data.options ?? {});

    if (idempotencyKey) {
      const lookup = await app.jobStore.checkIdempotency(idempotencyKey, parsed.data);
      if (lookup.hit === 'conflict') {
        throw new ConflictError(
          'Idempotency-Key was reused with a different request body.',
          'idempotency_conflict',
        );
      }
      if (lookup.hit === true) {
        const existing = await app.jobStore.getCloneMeta(lookup.jobId);
        return reply
          .code(200)
          .header('location', `/v1/clones/${existing.id}`)
          .send(metaToCloneJob(existing));
      }
    }

    const jobId = newJobId();
    const meta = await app.jobStore.createClone({
      id: jobId,
      sourceUrl: parsed.data.url,
      options,
      ...(options.webhookUrl ? { webhookUrl: options.webhookUrl } : {}),
    });

    await app.renderQueue.add(
      'render',
      {
        jobId,
        url: parsed.data.url,
        ...(options.webhookUrl ? { webhookUrl: options.webhookUrl } : {}),
      },
      { jobId },
    );

    if (idempotencyKey) {
      await app.jobStore.storeIdempotency(idempotencyKey, parsed.data, jobId);
    }

    if (req.user) {
      await app.activityStore.record(req.user.sub, {
        kind: 'clone',
        id: jobId,
        label: parsed.data.url,
        status: meta.status,
        createdAt: meta.createdAt,
      });
    }

    return reply.code(202).header('location', `/v1/clones/${jobId}`).send(metaToCloneJob(meta));
  });

  // GET /v1/clones/:id — current status
  app.get('/clones/:id', async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    if (!isValidUlid(id)) throw new BadRequestError('Invalid clone id format.');

    const meta = await app.jobStore.getCloneMeta(id);
    const ifNoneMatch = req.headers['if-none-match'];
    if (typeof ifNoneMatch === 'string' && ifNoneMatch === meta.etag) {
      return reply.code(304).send();
    }
    return reply
      .header('etag', meta.etag)
      .header('cache-control', 'private, max-age=2')
      .send(metaToCloneJob(meta));
  });

  // DELETE /v1/clones/:id — purge
  app.delete('/clones/:id', async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    if (!isValidUlid(id)) throw new BadRequestError('Invalid clone id format.');

    const meta = await app.jobStore.maybeGetCloneMeta(id);
    if (!meta) {
      // Spec allows 204 for already-deleted resources.
      return reply.code(204).send();
    }
    await app.jobStore.deleteClone(id);
    return reply.code(204).send();
  });
};

export default plugin;
