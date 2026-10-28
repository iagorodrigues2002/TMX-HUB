import { z } from 'zod';

const noticeSchema = z.object({
  id: z.string(),
  status: z.literal('paid'),
  provider: z.string(),
  amount_minor: z.string().nullable(),
  currency: z.string().nullable(),
  occurred_at: z.string().datetime(),
  offerId: z.string(),
  offerName: z.string(),
});
const messageSchema = z.object({
  type: z.enum(['ready', 'heartbeat', 'sales']),
  at: z.string().datetime(),
  cursor: z.string().datetime().optional(),
  offer_ids: z.array(z.string()),
  items: z.array(noticeSchema).default([]),
});
export type SaleNotice = z.infer<typeof noticeSchema> & { test?: boolean };
export type SaleNoticeMessage = z.infer<typeof messageSchema>;

export async function consumeSaleNoticeStream(
  body: ReadableStream<Uint8Array>,
  onMessage: (message: SaleNoticeMessage) => Promise<void>,
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) return;
      pending += decoder.decode(value, { stream: true });
      if (pending.length > 1_000_000) throw new Error('sale_notice_frame_too_large');
      let end = pending.indexOf('\n\n');
      while (end >= 0) {
        const frame = pending.slice(0, end);
        pending = pending.slice(end + 2);
        if (frame.startsWith('data: '))
          await onMessage(messageSchema.parse(JSON.parse(frame.slice(6))));
        end = pending.indexOf('\n\n');
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
