import { ManagedTaskSchema, type TaskStatus } from '@page-cloner/shared';
import { z } from 'zod';
import { request } from './request';

const common = {
  id: z.string(),
  unread: z.boolean(),
  createdAt: z.string().datetime({ offset: true }),
  title: z.string(),
};
export const CenterNotificationSchema = z.discriminatedUnion('kind', [
  z.object({ ...common, kind: z.literal('task'), task: ManagedTaskSchema }),
  z.object({
    ...common,
    kind: z.literal('sale'),
    sale: z.object({
      id: z.string(),
      offerId: z.string(),
      offerName: z.string(),
      provider: z.string(),
      amountMinor: z.string().nullable(),
      currency: z.string().nullable(),
      orderKind: z.string().nullable(),
      lastClick: z
        .object({ operatorId: z.string(), operatorName: z.string().nullable() })
        .nullable(),
    }),
  }),
  z.object({
    ...common,
    kind: z.literal('call'),
    call: z.object({
      callId: z.string(),
      message: z.string(),
      startsAt: z.string().datetime({ offset: true }),
      meetingUrl: z
        .string()
        .url()
        .refine((value) => /^https:\/\//i.test(value)),
      minutes: z.number(),
    }),
  }),
]);
export type CenterNotification = z.infer<typeof CenterNotificationSchema>;

export const notificationApi = {
  async list() {
    return z
      .object({ notifications: z.array(CenterNotificationSchema) })
      .parse(await request('/v1/notifications'));
  },
  async read(ids: string[]) {
    return request('/v1/notifications/read', { method: 'POST', body: { ids } });
  },
  async clearSales() {
    return request('/v1/notifications/clear-sales', { method: 'POST', body: { all: true } });
  },
  async status(id: string, status: TaskStatus, key: string) {
    return request(`/v1/notifications/tasks/${encodeURIComponent(id)}/status`, {
      method: 'POST',
      body: { status },
      headers: { 'Idempotency-Key': key },
    });
  },
};

export function centerSaleAmount(amountMinor: string | null, currency: string | null) {
  if (!currency || amountMinor === null || !/^-?\d+$/.test(amountMinor))
    return 'Valor indisponível';
  const amount = Number(amountMinor);
  if (!Number.isSafeInteger(amount)) return 'Valor indisponível';
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(amount / 100);
  } catch {
    return 'Valor indisponível';
  }
}
