export const RENDER_QUEUE_NAME = 'render-queue';
export const BUNDLE_QUEUE_NAME = 'bundle-queue';

export interface RenderJobData {
  jobId: string;
  url: string;
  webhookUrl?: string;
}

export interface BundleJobData {
  jobId: string;
  buildId: string;
}
