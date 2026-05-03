import type { Form, FormMode } from '@page-cloner/shared';
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
const FormParamsSchema = z.object({ id: z.string(), formId: z.string() });

const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

const UpdateFormBodySchema = z
  .object({
    mode: z.enum(['keep', 'replace', 'capture_redirect', 'disable']).optional(),
    current_action: z.string().url().optional(),
    redirect_to: z.string().url().nullable().optional(),
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, {
    message: 'At least one field must be provided.',
  });

function formToOutbound(form: Form, updatedAt: string): Record<string, unknown> {
  return {
    id: form.id,
    original_action: form.originalAction,
    current_action: form.currentAction,
    method: form.method,
    mode: form.mode,
    selector: form.selector,
    fields: form.fields.map((f) => ({
      name: f.name,
      type: f.type,
      ...(f.value !== undefined ? { value: f.value } : {}),
      hidden: f.hidden,
      required: f.required,
    })),
    redirect_to: form.redirectTo ?? null,
    updated_at: updatedAt,
  };
}

const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  // GET /v1/clones/:id/forms
  app.get('/clones/:id/forms', async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    if (!isValidUlid(id)) throw new BadRequestError('Invalid clone id.');

    const meta = await app.jobStore.getCloneMeta(id);
    const query = ListQuerySchema.parse(req.query);

    const state = await app.jobStore.getCloneState(id).catch(() => {
      throw new NotFoundError('Clone state not yet available.');
    });

    const start = query.cursor ? Number.parseInt(decodeCursor(query.cursor), 10) : 0;
    const slice = state.forms.slice(start, start + query.limit);
    const nextStart = start + slice.length;
    const next_cursor = nextStart < state.forms.length ? encodeCursor(String(nextStart)) : null;

    return reply.header('etag', meta.etag).send({
      data: slice.map((f) => formToOutbound(f, meta.updatedAt)),
      pagination: {
        next_cursor,
        limit: query.limit,
        total_estimate: state.forms.length,
      },
    });
  });

  // PATCH /v1/clones/:id/forms/:formId
  app.patch('/clones/:id/forms/:formId', async (req, reply) => {
    const { id, formId } = FormParamsSchema.parse(req.params);
    if (!isValidUlid(id)) throw new BadRequestError('Invalid clone id.');
    if (!isValidPrefixedUlid(formId, 'frm')) throw new BadRequestError('Invalid form id.');

    const meta = await app.jobStore.getCloneMeta(id);
    const ifMatch = req.headers['if-match'];
    if (typeof ifMatch === 'string' && ifMatch !== meta.etag) {
      throw new PreconditionFailedError();
    }

    const parsed = UpdateFormBodySchema.safeParse(req.body);
    if (!parsed.success) throw zodToProblem(parsed.error, req.url);

    const state = await app.jobStore.getCloneState(id);
    const idx = state.forms.findIndex((f) => f.id === formId);
    if (idx < 0) throw new NotFoundError(`Form ${formId} not found.`);

    const existing = state.forms[idx];
    if (!existing) throw new NotFoundError(`Form ${formId} not found.`);

    const updated: Form = {
      ...existing,
      ...(parsed.data.mode ? { mode: parsed.data.mode as FormMode } : {}),
      ...(parsed.data.current_action ? { currentAction: parsed.data.current_action } : {}),
      ...(parsed.data.redirect_to !== undefined
        ? parsed.data.redirect_to === null
          ? { redirectTo: undefined }
          : { redirectTo: parsed.data.redirect_to }
        : {}),
    };
    state.forms[idx] = updated;
    await app.jobStore.saveCloneState(state);

    const newMeta = await app.jobStore.setCloneStatus(id, meta.status, {
      forms: state.forms.length,
    });

    return reply.header('etag', newMeta.etag).send(formToOutbound(updated, newMeta.updatedAt));
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
