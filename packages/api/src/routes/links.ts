import type { Link } from '@page-cloner/shared';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { isValidPrefixedUlid, isValidUlid } from '../lib/ids.js';
import {
  BadRequestError,
  NotFoundError,
  PreconditionFailedError,
  zodToProblem,
} from '../lib/problem.js';

const IdParamSchema = z.object({ id: z.string() });
const LinkParamsSchema = z.object({ id: z.string(), linkId: z.string() });

const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
  cta_only: z
    .union([z.boolean(), z.string()])
    .transform((v) => v === true || v === 'true')
    .default(false),
});

const UpdateLinkBodySchema = z
  .object({
    current_href: z.string(),
  })
  .strict();

const BulkBodySchema = z
  .object({
    match: z.enum(['literal', 'regex']).default('literal'),
    from: z.string().min(1).max(2048),
    to: z.string().max(2048),
    scope: z.enum(['all', 'cta_only']).default('all'),
  })
  .strict();

function linkToOutbound(link: Link, updatedAt: string): Record<string, unknown> {
  return {
    id: link.id,
    original_href: link.originalHref,
    current_href: link.currentHref,
    text: link.text,
    selector: link.selector,
    is_cta: link.isCta,
    ...(link.rel ? { rel: link.rel } : {}),
    updated_at: updatedAt,
  };
}

const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  // GET /v1/clones/:id/links
  app.get('/clones/:id/links', async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    if (!isValidUlid(id)) throw new BadRequestError('Invalid clone id.');

    const meta = await app.jobStore.getCloneMeta(id);
    const query = ListQuerySchema.parse(req.query);

    const state = await app.jobStore.getCloneState(id).catch(() => {
      throw new NotFoundError('Clone state not yet available.');
    });

    const all = query.cta_only ? state.links.filter((l) => l.isCta) : state.links;
    const start = query.cursor ? Number.parseInt(decodeCursor(query.cursor), 10) : 0;
    const slice = all.slice(start, start + query.limit);
    const nextStart = start + slice.length;
    const next_cursor = nextStart < all.length ? encodeCursor(String(nextStart)) : null;

    return reply.header('etag', meta.etag).send({
      data: slice.map((l) => linkToOutbound(l, meta.updatedAt)),
      pagination: {
        next_cursor,
        limit: query.limit,
        total_estimate: all.length,
      },
    });
  });

  // PATCH /v1/clones/:id/links/:linkId
  app.patch('/clones/:id/links/:linkId', async (req, reply) => {
    const { id, linkId } = LinkParamsSchema.parse(req.params);
    if (!isValidUlid(id)) throw new BadRequestError('Invalid clone id.');
    if (!isValidPrefixedUlid(linkId, 'lnk')) throw new BadRequestError('Invalid link id.');

    const meta = await app.jobStore.getCloneMeta(id);
    const ifMatch = req.headers['if-match'];
    if (typeof ifMatch === 'string' && ifMatch !== meta.etag) {
      throw new PreconditionFailedError();
    }

    const parsed = UpdateLinkBodySchema.safeParse(req.body);
    if (!parsed.success) throw zodToProblem(parsed.error, req.url);

    const state = await app.jobStore.getCloneState(id);
    const idx = state.links.findIndex((l) => l.id === linkId);
    if (idx < 0) throw new NotFoundError(`Link ${linkId} not found.`);
    const existing = state.links[idx];
    if (!existing) throw new NotFoundError(`Link ${linkId} not found.`);

    const updated: Link = { ...existing, currentHref: parsed.data.current_href };
    state.links[idx] = updated;
    await app.jobStore.saveCloneState(state);

    const newMeta = await app.jobStore.setCloneStatus(id, meta.status, {
      links: state.links.length,
    });
    return reply.header('etag', newMeta.etag).send(linkToOutbound(updated, newMeta.updatedAt));
  });

  // POST /v1/clones/:id/links/bulk
  app.post('/clones/:id/links/bulk', async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    if (!isValidUlid(id)) throw new BadRequestError('Invalid clone id.');

    const parsed = BulkBodySchema.safeParse(req.body);
    if (!parsed.success) throw zodToProblem(parsed.error, req.url);

    const meta = await app.jobStore.getCloneMeta(id);
    const state = await app.jobStore.getCloneState(id);

    let regex: RegExp | null = null;
    if (parsed.data.match === 'regex') {
      try {
        regex = new RegExp(parsed.data.from, 'g');
      } catch {
        throw new BadRequestError('Invalid regex pattern.');
      }
    }

    let matched = 0;
    let updated = 0;
    const affected: string[] = [];

    for (const link of state.links) {
      if (parsed.data.scope === 'cta_only' && !link.isCta) continue;
      const before = link.currentHref;
      let after = before;
      if (regex) {
        if (regex.test(before)) {
          regex.lastIndex = 0;
          after = before.replace(regex, parsed.data.to);
          matched += 1;
        }
      } else if (before === parsed.data.from) {
        after = parsed.data.to;
        matched += 1;
      }
      if (after !== before) {
        link.currentHref = after;
        updated += 1;
        affected.push(link.id);
      }
    }

    if (updated > 0) {
      await app.jobStore.saveCloneState(state);
      await app.jobStore.setCloneStatus(id, meta.status, {
        links: state.links.length,
      });
    }

    return reply.send({ matched, updated, affected_ids: affected });
  });
};

function encodeCursor(s: string): string {
  return Buffer.from(s, 'utf-8').toString('base64url');
}

function decodeCursor(c: string): string {
  try {
    return Buffer.from(c, 'base64url').toString('utf-8');
  } catch {
    return '0';
  }
}

export default plugin;
