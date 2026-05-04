export const RENDER_QUEUE_NAME = 'render-queue';
export const BUNDLE_QUEUE_NAME = 'bundle-queue';
export const VSL_QUEUE_NAME = 'vsl-queue';

export interface RenderJobData {
  jobId: string;
  url: string;
  webhookUrl?: string;
}

export interface BundleJobData {
  jobId: string;
  buildId: string;
}

export interface VslJobData {
  jobId: string;
  url: string;
}
