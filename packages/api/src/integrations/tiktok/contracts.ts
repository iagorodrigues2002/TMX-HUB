export { TikTokDestinationSchema } from '@page-cloner/shared';
import { z } from 'zod';

export const TikTokTestSchema = z
  .object({
    test_event_code: z.string().trim().min(1).max(256).optional(),
    event_url: z.string().url().max(2048).optional(),
    email: z.string().trim().email().max(320).optional(),
    phone: z.string().trim().min(6).max(48).optional(),
  })
  .strict();

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
