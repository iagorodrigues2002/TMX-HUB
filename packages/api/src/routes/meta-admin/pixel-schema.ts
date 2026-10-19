import { z } from 'zod';

export const PixelSchema = z.object({
  name: z.string().trim().min(1).max(80),
  pixel_id: z.string().regex(/^\d{5,32}$/),
  access_token: z.string().min(20).max(4096),
  test_event_code: z.string().trim().max(128).optional(),
});

export const PixelUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  pixel_id: z.string().regex(/^\d{5,32}$/),
  access_token: z.string().min(20).max(4096).optional(),
  test_event_code: z.string().trim().max(128).nullable().optional(),
});

export const TestEventSchema = z.object({
  event_name: z.enum(['InitiateCheckout', 'Purchase']),
});

export const TestEventCodeSchema = z.object({
  test_event_code: z.string().trim().min(1).max(128),
});

export const PixelProductsSchema = z.object({
  product_ids: z.array(z.string().trim().min(1).max(256)).max(100),
});
