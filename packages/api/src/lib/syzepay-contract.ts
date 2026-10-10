import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

/** Verified against the actual SyzePay t=...,v1=... header and raw body. */
export function verifySyzepaySignature(
  body: Buffer,
  header: string | undefined,
  secret: string,
  receivedAt: Date,
  toleranceSeconds = 300,
) {
  if (!header || header.length > 4096) return false;
  const parts = header.split(',').map((p) => p.trim().split('='));
  const times = parts.filter(([key]) => key === 't');
  if (times.length !== 1 || !/^\d{9,12}$/.test(times[0]![1] ?? '')) return false;
  const time = times[0]![1]!;
  if (Math.abs(receivedAt.getTime() / 1000 - Number(time)) > toleranceSeconds) return false;
  const expected = createHmac('sha256', secret).update(`${time}.`).update(body).digest();
  return parts
    .filter(([key]) => key === 'v1')
    .some(
      ([, value]) =>
        /^[a-f0-9]{64}$/i.test(value ?? '') &&
        timingSafeEqual(expected, Buffer.from(value!, 'hex')),
    );
}
const money = z.number().int().min(0).max(1_000_000_000_000);
export const syzepayEventSchema = z.object({
  id: z.string().min(1).max(256),
  type: z.enum(['order.created', 'order.paid']),
  created: z.number().int().min(0).max(4_102_444_800),
  livemode: z.boolean().optional(),
  is_test: z.boolean().optional(),
  test: z.boolean().optional(),
  data: z.object({
    object: z.object({
      id: z.string().min(1).max(256),
      store_id: z.string().min(1).max(256),
      status: z.string().max(64),
      kind: z.string().max(64),
      amount: money,
      currency: z.string().regex(/^[A-Z]{3}$/),
      fee_amount: money.nullish(),
      net_amount: money.nullish(),
      customer_email: z.string().max(320).nullish(),
      customer_name: z.string().max(200).nullish(),
      checkout_session_id: z.string().max(256).nullish(),
      created_at: z.string().datetime({ offset: true }),
      utm: z.record(z.string().max(4096).nullable()).optional(),
    }),
  }),
});
export function parseSyzepayEvent(body: Buffer) {
  return syzepayEventSchema.parse(JSON.parse(body.toString('utf8')));
}
export function syzepayPurchaseAllowed(event: z.infer<typeof syzepayEventSchema>) {
  return (
    event.type === 'order.paid' &&
    event.data.object.status === 'succeeded' &&
    event.data.object.kind === 'sale' &&
    event.data.object.amount > 0 &&
    event.livemode !== false &&
    !event.is_test &&
    !event.test
  );
}
