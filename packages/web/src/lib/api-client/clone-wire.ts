import type { CloneState } from '@page-cloner/shared';
import type { Form } from '@page-cloner/shared';
import type { Link } from '@page-cloner/shared';
import type { BuildJob } from '@page-cloner/shared';

// ---- snake/camel converters (narrow, hand-rolled — the API surface is small) ----

export interface CloneJobWire {
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

export function fromCloneJobWire(w: CloneJobWire): CloneJob {
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

export interface FormWire {
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

export function fromFormWire(w: FormWire): Form {
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

export interface LinkWire {
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

export function fromLinkWire(w: LinkWire): Link {
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

export interface BuildJobWire {
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

export function fromBuildJobWire(w: BuildJobWire): BuildJob {
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
