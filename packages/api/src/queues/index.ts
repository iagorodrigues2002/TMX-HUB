export const RENDER_QUEUE_NAME = 'render-queue';
export const BUNDLE_QUEUE_NAME = 'bundle-queue';
export const VSL_QUEUE_NAME = 'vsl-queue';
export const FUNNEL_QUEUE_NAME = 'funnel-queue';
export const SHIELD_QUEUE_NAME = 'shield-queue';
export const MEDIA_QUEUE_NAME = 'media-queue';
export const META_QUEUE_NAME = 'meta-capi-queue';
export const UTMIFY_DELIVERY_QUEUE_NAME = 'utmify-delivery-queue';

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

export interface FunnelJobData {
  jobId: string;
  url: string;
}

export interface ShieldJobData {
  jobId: string;
}

export interface MediaJobData {
  jobId: string;
}

export interface MetaJobData {
  deliveryId: string;
}

export interface UtmifyDeliveryJobData {
  deliveryId: string;
}
