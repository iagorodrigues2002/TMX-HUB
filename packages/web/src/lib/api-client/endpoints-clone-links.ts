import type { Link } from '@page-cloner/shared';
import type { UpdateLinkRequest } from '@page-cloner/shared';
import type { BulkLinkUpdate } from '@page-cloner/shared';
import type { BuildOptionsRequest } from '@page-cloner/shared';
import type { BuildJob } from '@page-cloner/shared';
import type { LinkWire } from './clone-wire.js';
import { fromLinkWire } from './clone-wire.js';
import type { BuildJobWire } from './clone-wire.js';
import { fromBuildJobWire } from './clone-wire.js';
import { request } from './request.js';
import type { ListResult } from './response-types.js';
import type { PaginatedResponse } from './response-types.js';
import type { BulkLinkUpdateResult } from './response-types.js';
export const endpoints = {
  async getCloneLinks(
    id: string,
    cursor?: string,
    limit = 200,
    signal?: AbortSignal,
  ): Promise<ListResult<Link>> {
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    if (cursor) params.set('cursor', cursor);
    const wire = await request<PaginatedResponse<LinkWire>>(
      `/v1/clones/${id}/links?${params.toString()}`,
      { signal },
    );
    return {
      data: wire.data.map(fromLinkWire),
      nextCursor: wire.pagination.next_cursor,
      limit: wire.pagination.limit,
      totalEstimate: wire.pagination.total_estimate,
    };
  },

  async updateLink(id: string, linkId: string, body: UpdateLinkRequest): Promise<Link> {
    const wire = await request<LinkWire>(`/v1/clones/${id}/links/${linkId}`, {
      method: 'PATCH',
      body: { current_href: body.currentHref },
    });
    return fromLinkWire(wire);
  },

  async bulkUpdateLinks(id: string, body: BulkLinkUpdate): Promise<BulkLinkUpdateResult> {
    const wire = await request<{
      matched: number;
      updated: number;
      affected_ids: string[];
    }>(`/v1/clones/${id}/links/bulk`, {
      method: 'POST',
      body: {
        match: body.isRegex ? 'regex' : 'literal',
        from: body.from,
        to: body.to,
      },
    });
    return {
      matched: wire.matched,
      updated: wire.updated,
      affectedIds: wire.affected_ids,
    };
  },

  async createBuild(id: string, opts: BuildOptionsRequest): Promise<BuildJob> {
    const wire = await request<BuildJobWire>(`/v1/clones/${id}/build`, {
      method: 'POST',
      body: {
        format: opts.format,
        include_assets: opts.inlineAssets ?? false,
      },
    });
    return fromBuildJobWire(wire);
  },

  async getBuild(id: string, buildId: string, signal?: AbortSignal): Promise<BuildJob> {
    const wire = await request<BuildJobWire>(`/v1/clones/${id}/builds/${buildId}`, { signal });
    return fromBuildJobWire(wire);
  },
};
