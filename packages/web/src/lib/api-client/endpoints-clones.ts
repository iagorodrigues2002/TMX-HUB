import { CreateCloneRequestSchema } from '@page-cloner/shared';
import type { Form } from '@page-cloner/shared';
import type { UpdateFormRequest } from '@page-cloner/shared';
import type { z } from 'zod';
import { env } from '../env.js';
import type { CloneJob } from './clone-wire.js';
import type { CloneJobWire } from './clone-wire.js';
import { fromCloneJobWire } from './clone-wire.js';
import type { FormWire } from './clone-wire.js';
import { fromFormWire } from './clone-wire.js';
import { request } from './request.js';
import type { ListResult } from './response-types.js';
import type { PaginatedResponse } from './response-types.js';
import type { VslJobView } from './video-wire.js';
import type { VslJobWire } from './video-wire.js';
import { fromVslJobWire } from './video-wire.js';
export const endpoints = {
  async createVslJob(url: string): Promise<VslJobView> {
    const wire = await request<VslJobWire>('/v1/vsl-jobs', { method: 'POST', body: { url } });
    return fromVslJobWire(wire);
  },

  async getVslJob(id: string, signal?: AbortSignal): Promise<VslJobView> {
    const wire = await request<VslJobWire>(`/v1/vsl-jobs/${id}`, { signal });
    return fromVslJobWire(wire);
  },

  async createClone(input: z.infer<typeof CreateCloneRequestSchema>): Promise<CloneJob> {
    const parsed = CreateCloneRequestSchema.parse(input);
    const body = {
      url: parsed.url,
      ...(parsed.options
        ? {
            options: {
              render_mode: parsed.options.renderMode,
              inline_assets: parsed.options.inlineAssets,
              user_agent: parsed.options.userAgent,
              viewport: parsed.options.viewport,
              link_replacements: parsed.options.linkReplacements,
              keep_script_srcs: parsed.options.keepScriptSrcs,
            },
          }
        : {}),
    };
    const wire = await request<CloneJobWire>('/v1/clones', {
      method: 'POST',
      body,
    });
    return fromCloneJobWire(wire);
  },

  async getClone(id: string, signal?: AbortSignal): Promise<CloneJob> {
    const wire = await request<CloneJobWire>(`/v1/clones/${id}`, { signal });
    return fromCloneJobWire(wire);
  },

  async deleteClone(id: string): Promise<void> {
    await request<void>(`/v1/clones/${id}`, { method: 'DELETE' });
  },

  previewUrl(id: string): string {
    return `${env.NEXT_PUBLIC_API_URL}/v1/clones/${id}/preview`;
  },

  async getCloneForms(
    id: string,
    cursor?: string,
    limit = 200,
    signal?: AbortSignal,
  ): Promise<ListResult<Form>> {
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    if (cursor) params.set('cursor', cursor);
    const wire = await request<PaginatedResponse<FormWire>>(
      `/v1/clones/${id}/forms?${params.toString()}`,
      { signal },
    );
    return {
      data: wire.data.map(fromFormWire),
      nextCursor: wire.pagination.next_cursor,
      limit: wire.pagination.limit,
      totalEstimate: wire.pagination.total_estimate,
    };
  },

  async updateForm(id: string, formId: string, body: UpdateFormRequest): Promise<Form> {
    const wireBody: Record<string, unknown> = {};
    if (body.mode !== undefined) wireBody.mode = body.mode;
    if (body.currentAction !== undefined) wireBody.current_action = body.currentAction;
    if (body.redirectTo !== undefined) wireBody.redirect_to = body.redirectTo;
    const wire = await request<FormWire>(`/v1/clones/${id}/forms/${formId}`, {
      method: 'PATCH',
      body: wireBody,
    });
    return fromFormWire(wire);
  },
};
