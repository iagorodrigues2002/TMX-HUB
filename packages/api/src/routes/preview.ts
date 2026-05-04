import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { isValidUlid } from '../lib/ids.js';
import { BadRequestError, ConflictError, NotFoundError } from '../lib/problem.js';

const IdParamSchema = z.object({ id: z.string() });

// CSP without frame-ancestors — we set it dynamically per-request below so the
// preview can be embedded by any origin (the content is sanitized; the URL is
// already gated by an unguessable ULID).
const BASE_CSP =
  "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'none'";

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
      // Allow any ancestor — the web app and the API live on different
      // origins (page-clonerweb vs page-clonerapi). Sanitized content + ULID
      // gating make permissive frame-ancestors safe here.
      .header('content-security-policy', `${BASE_CSP}; frame-ancestors *`)
      .header('x-content-type-options', 'nosniff')
      .header('etag', meta.etag)
      .send(state.html);
  });
};

export default plugin;
