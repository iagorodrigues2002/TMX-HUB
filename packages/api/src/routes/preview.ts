import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { isValidUlid } from '../lib/ids.js';
import { BadRequestError, ConflictError, NotFoundError } from '../lib/problem.js';

const IdParamSchema = z.object({ id: z.string() });

const CSP =
  "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'none'; frame-ancestors 'self'";

const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get('/clones/:id/preview', async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    if (!isValidUlid(id)) throw new BadRequestError('Invalid clone id format.');

    const meta = await app.jobStore.getCloneMeta(id);
    if (meta.status !== 'ready') {
      throw new ConflictError(`Clone is not yet ready (status: ${meta.status}).`, 'not_ready');
    }

    const ifNoneMatch = req.headers['if-none-match'];
    if (typeof ifNoneMatch === 'string' && ifNoneMatch === meta.etag) {
      return reply.code(304).send();
    }

    let state: { html: string };
    try {
      state = await app.jobStore.getCloneState(id);
    } catch {
      throw new NotFoundError(`Sanitized HTML not found for clone ${id}.`);
    }

    return reply
      .header('content-type', 'text/html; charset=utf-8')
      .header('content-security-policy', CSP)
      .header('x-content-type-options', 'nosniff')
      .header('etag', meta.etag)
      .send(state.html);
  });
};

export default plugin;
