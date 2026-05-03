import type {
  BuildJob,
  BuildOptionsRequest,
  BulkLinkUpdate,
  CloneState,
  Form,
  Link,
  Problem,
  UpdateFormRequest,
  UpdateLinkRequest,
} from '@page-cloner/shared';
import { CreateCloneRequestSchema } from '@page-cloner/shared';
import { z } from 'zod';
import { env } from './env.js';
import { ApiError } from './query-client.js';

// The API uses snake_case in the wire format per OpenAPI; shared types use
// camelCase. The client converts at the boundary so the rest of the app
// stays in TS-idiomatic shape.

interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    next_cursor: string | null;
    limit: number;
    total_estimate?: number;
  };
}

export interface ListResult<T> {
  data: T[];
  nextCursor: string | null;
  limit: number;
  totalEstimate?: number;
}

export interface BulkLinkUpdateResult {
  matched: number;
  updated: number;
  affectedIds: string[];
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const url = `${env.NEXT_PUBLIC_API_URL}${path}`;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...opts.headers,
  };
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
      cache: 'no-store',
    });
  } catch (err) {
    throw new ApiError(`Network error: ${(err as Error).message}`, 0);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const text = await res.text();
  const json = text ? safeJsonParse(text) : null;

  if (!res.ok) {
    const problem = json as Problem | null;
    const message = problem?.detail ?? problem?.title ?? `HTTP ${res.status}`;
    throw new ApiError(message, res.status, problem);
  }

  return json as T;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// ---- snake/camel converters (narrow, hand-rolled — the API surface is small) ----

interface CloneJobWire {
  id: string;
  status: CloneState['status'];
  url: string;
  final_url?: string;
  progress?: number;
  options?: {
    render_mode?: 'static' | 'js';
    inline_assets?: boolean;
    user_agent?: string;
    viewport?: { width: number; height: number };
  };
  counts?: {
    forms?: number;
    links?: number;
    assets?: number;
    bytes?: number;
  };
  error?: { code: string; message: string };
  rendered_at?: string;
  created_at: string;
  updated_at: string;
  links?: {
    self?: string;
    preview?: string;
    forms?: string;
    links_collection?: string;
  };
}

export interface CloneJob {
  id: string;
  status: CloneState['status'];
  url: string;
  finalUrl?: string;
  progress?: number;
  counts?: {
    forms?: number;
    links?: number;
    assets?: number;
    bytes?: number;
  };
  error?: { code: string; message: string };
  renderedAt?: string;
  createdAt: string;
  updatedAt: string;
}

function fromCloneJobWire(w: CloneJobWire): CloneJob {
  return {
    id: w.id,
    status: w.status,
    url: w.url,
    finalUrl: w.final_url,
    progress: w.progress,
    counts: w.counts
      ? {
          forms: w.counts.forms,
          links: w.counts.links,
          assets: w.counts.assets,
          bytes: w.counts.bytes,
        }
      : undefined,
    error: w.error,
    renderedAt: w.rendered_at,
    createdAt: w.created_at,
    updatedAt: w.updated_at,
  };
}

interface FormWire {
  id: string;
  selector: string;
  original_action: string;
  current_action: string;
  method: string;
  mode: Form['mode'];
  redirect_to?: string | null;
  fields: Array<{
    name: string;
    type: string;
    value?: string;
    hidden: boolean;
    required?: boolean;
    placeholder?: string;
  }>;
  updated_at: string;
}

function fromFormWire(w: FormWire): Form {
  return {
    id: w.id,
    selector: w.selector,
    originalAction: w.original_action,
    currentAction: w.current_action,
    method: (w.method === 'GET' ? 'GET' : 'POST') as Form['method'],
    mode: w.mode,
    redirectTo: w.redirect_to ?? undefined,
    fields: w.fields.map((f) => ({
      name: f.name,
      type: f.type,
      value: f.value,
      hidden: f.hidden,
      required: Boolean(f.required),
    })),
  };
}

interface LinkWire {
  id: string;
  selector: string;
  original_href: string;
  current_href: string;
  text?: string;
  rel?: string;
  is_external?: boolean;
  is_cta: boolean;
  updated_at: string;
}

function fromLinkWire(w: LinkWire): Link {
  return {
    id: w.id,
    selector: w.selector,
    originalHref: w.original_href,
    currentHref: w.current_href,
    text: w.text ?? '',
    rel: w.rel,
    isExternal: Boolean(w.is_external),
    isCta: w.is_cta,
  };
}

interface BuildJobWire {
  id: string;
  clone_id: string;
  status: BuildJob['status'];
  options: {
    format: 'html' | 'zip';
    include_assets?: boolean;
  };
  artifact?: {
    bytes: number;
    content_type: string;
    sha256: string;
    filename: string;
  };
  download_url?: string;
  download_expires_at?: string;
  error?: { code: string; message: string };
  created_at: string;
  updated_at: string;
}

function fromBuildJobWire(w: BuildJobWire): BuildJob {
  return {
    id: w.id,
    jobId: w.clone_id,
    status: w.status,
    format: w.options.format,
    downloadUrl: w.download_url,
    bytes: w.artifact?.bytes,
    createdAt: w.created_at,
    updatedAt: w.updated_at,
    error: w.error,
  };
}

// ---- public methods ----

export const apiClient = {
  baseUrl: env.NEXT_PUBLIC_API_URL,

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

  getDownloadUrl(id: string, buildId: string): string {
    return `${env.NEXT_PUBLIC_API_URL}/v1/clones/${id}/builds/${buildId}/download`;
  },
};

export { ApiError };
