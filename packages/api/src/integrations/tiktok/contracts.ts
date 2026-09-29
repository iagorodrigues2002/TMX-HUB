import { z } from 'zod';

export const TikTokDestinationSchema = z.object({
  name: z.string().trim().min(1).max(100),
  // Pixel codes are opaque TikTok identifiers. Restricting them to a guessed
  // numeric format would reject valid pixels.
  pixel_code: z.string().trim().min(6).max(128).regex(/^[A-Za-z0-9_-]+$/),
  access_token: z.string().trim().min(16).max(4096),
  enabled: z.boolean().optional().default(true),
}).strict();

export const TikTokTestSchema = z.object({
  test_event_code: z.string().trim().min(1).max(256),
  event_url: z.string().url().max(2048).optional(),
  email: z.string().trim().email().max(320).optional(),
  phone: z.string().trim().min(6).max(48).optional(),
}).strict();

export type TikTokEventInput = {
  pixelCode: string;
  eventId: string;
  eventName: 'Purchase';
  occurredAt: Date;
  eventUrl: string;
  referrer?: string;
  value: number;
  currency: string;
  orderId: string;
  ttclid?: string;
  ttp?: string;
  email?: string;
  phone?: string;
  externalId?: string;
  ip?: string;
  userAgent?: string;
  contentId?: string;
  contentName?: string;
  testEventCode?: string;
};
