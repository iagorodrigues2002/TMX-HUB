import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { isValidPrefixedUlid, isValidUlid, newBuildId } from '../lib/ids.js';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  zodToProblem,
} from '../lib/problem.js';
import type { BuildMetadata } from '../services/job-store.js';

const CloneIdParam = z.object({ id: z.string() });
const BuildParamsSchema = z.object({ id: z.string(), buildId: z.string() });

const BuildBodySchema = z
  .object({
    format: z.enum(['html', 'zip']),
    include_assets: z.boolean().default(true),
    apply_edits: z.boolean().default(true),
  })
  .strict();

function buildToOutbound(meta: BuildMetadata): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: meta.id,
    clone_id: meta.cloneId,
    status: meta.status,
    options: {
      format: meta.format,
      include_assets: meta.inlineAssets || meta.format === 'zip',
    },
    created_at: meta.createdAt,
    updated_at: meta.updatedAt,
    links: {
      self: `/v1/clones/${meta.cloneId}/builds/${meta.id}`,
    },
  };
  if (meta.bytes !== undefined && meta.contentType && meta.sha256 && meta.filename) {
    out.artifact = {
      bytes: meta.bytes,
      content_type: meta.contentType,
      sha256: meta.sha256,
      filename: meta.filename,
    };
  }
  if (meta.errorCode && meta.errorMessage) {
    out.error = { code: meta.errorCode, message: meta.errorMessage };
  }
  return out;
}

const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  // POST /v1/clones/:id/build
  app.post('/clones/:id/build', async (req, reply) => {
    const { id } = CloneIdParam.parse(req.params);
    if (!isValidUlid(id)) throw new BadRequestError('Invalid clone id.');

    const cloneMeta = await app.jobStore.getCloneMeta(id);
    if (cloneMeta.status !== 'ready') {
      throw new ConflictError(
        `Clone is not in a buildable state (status: ${cloneMeta.status}).`,
        'not_buildable',
      );
    }

    const parsed = BuildBodySchema.safeParse(req.body);
    if (!parsed.success) throw zodToProblem(parsed.error, req.url);

    const buildId = newBuildId();
    const now = new Date().toISOString();
    const meta = await app.jobStore.createBuild({
      id: buildId,
      cloneId: id,
      status: 'queued',
      format: parsed.data.format,
      inlineAssets: parsed.data.include_assets && parsed.data.format === 'html',
      applyEdits: parsed.data.apply_edits,
      createdAt: now,
      updatedAt: now,
    });

    await app.bundleQueue.add('bundle', { jobId: id, buildId }, { jobId: buildId });

    return reply
      .code(202)
      .header('location', `/v1/clones/${id}/builds/${buildId}`)
      .send(buildToOutbound(meta));
  });

  // GET /v1/clones/:id/builds/:buildId
  app.get('/clones/:id/builds/:buildId', async (req, reply) => {
    const { id, buildId } = BuildParamsSchema.parse(req.params);
    if (!isValidUlid(id)) throw new BadRequestError('Invalid clone id.');
    if (!isValidPrefixedUlid(buildId, 'bld')) throw new BadRequestError('Invalid build id.');

    const meta = await app.jobStore.getBuildMeta(buildId);
    if (meta.cloneId !== id) throw new NotFoundError(`Build ${buildId} not found for clone ${id}.`);

    const out = buildToOutbound(meta);
    if (meta.status === 'ready' && meta.storageKey) {
      const url = await app.storage.presignGet(meta.storageKey, 60 * 60 * 24, meta.filename);
      out.download_url = url;
      out.download_expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    }

    const etag = `"${meta.id}:${meta.updatedAt}"`;
    const ifNoneMatch = req.headers['if-none-match'];
    if (typeof ifNoneMatch === 'string' && ifNoneMatch === etag) {
      return reply.code(304).send();
    }
    return reply.header('etag', etag).send(out);
  });

};

export default plugin;
