import type { BundleOptions, CloneState } from '../types.js';
import { buildSingleHtml } from './single-html.js';
import { buildZip } from './zip.js';

export async function bundle(state: CloneState, opts: BundleOptions): Promise<Buffer> {
  const applyEdits = opts.applyEdits !== false;
  if (opts.format === 'html') {
    return buildSingleHtml(state, {
      applyEdits,
      inlineAssets: opts.inlineAssets !== false,
    });
  }
  if (opts.format === 'zip') {
    return buildZip(state, { applyEdits });
  }
  throw new Error(`Unsupported bundle format: ${String(opts.format)}`);
}
