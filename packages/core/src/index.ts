export { fetchPage } from './fetch/fetch-page.js';
export { inspectHtml } from './extract/inspect.js';
export { sanitize } from './sanitize/index.js';
export { resolveAssets } from './assets/resolve.js';
export { extractForms } from './extract/forms.js';
export { extractLinks } from './extract/links.js';
export { bundle } from './bundle/index.js';
export { clone } from './clone.js';

export { disposeBrowser, getBrowser } from './fetch/browser-pool.js';
export { extractVisibleText } from './diff/extract-text.js';
export { diffLines } from './diff/lcs-diff.js';
export type { DiffEntry, DiffResult, DiffSummary, DiffOp } from './diff/lcs-diff.js';
export { detectBothManifests, detectVideoManifest } from './vsl/detect.js';
export { downloadManifestToFile } from './vsl/download.js';
export type {
  DetectCloakerResult,
  DetectOptions,
  DetectResult,
  ObservedMedia,
} from './vsl/detect.js';
export type { DownloadOptions, DownloadResult } from './vsl/download.js';
export { TRACKING_HOSTS, isTrackingUrl } from './sanitize/tracking-hosts.js';
export { generateSelector } from './extract/selectors.js';
export { walkCss } from './assets/css-walker.js';
export { parseSrcset, serializeSrcset } from './assets/srcset.js';

export type * from './types.js';
