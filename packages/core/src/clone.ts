import { ulid } from 'ulid';
import type { CloneState, CloneOpts } from './types.js';
import { fetchPage } from './fetch/fetch-page.js';
import { sanitize } from './sanitize/index.js';
import { resolveAssets } from './assets/resolve.js';
import { extractForms } from './extract/forms.js';
import { extractLinks } from './extract/links.js';

export async function clone(url: string, opts: CloneOpts = {}): Promise<CloneState> {
  const jobId = ulid();
  const createdAt = new Date().toISOString();

  const fetched = await fetchPage(url, {
    renderMode: opts.renderMode,
    userAgent: opts.userAgent,
    viewport: opts.viewport,
    ...(opts.fetch ?? {}),
  });

  const sanitized = sanitize(fetched.html, opts.sanitize ?? {});
  const resolved = await resolveAssets(sanitized.html, fetched.finalUrl, {
    download: false,
    ...(opts.assets ?? {}),
  });

  const forms = extractForms(resolved.html, { baseUrl: fetched.finalUrl });
  const links = extractLinks(resolved.html, { baseUrl: fetched.finalUrl });

  const updatedAt = new Date().toISOString();

  return {
    jobId,
    sourceUrl: url,
    finalUrl: fetched.finalUrl,
    status: 'ready',
    html: resolved.html,
    assets: resolved.assets,
    forms,
    links,
    createdAt,
    updatedAt,
  };
}
