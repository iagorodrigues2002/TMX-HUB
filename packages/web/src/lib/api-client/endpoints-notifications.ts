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
  z.object({
    ...common,
    kind: z.literal('spy'),
    spy: z.object({
      offerId: z.string(),
      offerName: z.string(),
      newAds: z.number().int().nonnegative(),
      newPages: z.number().int().nonnegative(),
      pageNames: z.array(z.string()),
      newDomains: z.number().int().nonnegative().optional(),
      domains: z.array(z.string()).optional(),
    }),
  }),
  z.object({
    ...common,
    kind: z.literal('traffic'),
    traffic: z.object({
      type: z.enum(['ad_rejected', 'account_disabled']),
      ownerId: z.string(),
      companyId: z.string().uuid().optional(),
      accountId: z.string(),
      accountName: z.string(),
      campaignId: z.string().optional(),
      campaignName: z.string().optional(),
      adId: z.string().optional(),
      adName: z.string().optional(),
    }),
  }),
  z.object({
    ...common,
    kind: z.literal('finance'),
    finance: z.object({
      companyId: z.string().uuid(),
      companyName: z.string(),
      provider: z.string(),
      direction: z.enum(['incoming', 'outgoing']),
      amount: z.string().regex(/^\d+(\.\d+)?$/),
      currency: z.string(),
      category: z.string(),
      occurredAt: z.string().datetime({ offset: true }),
    }),
  }),
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
        .object({
          operatorId: z.string(),
          operatorName: z.string().nullable(),
          viaSequence: z.boolean().optional(),
        })
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
      minutes: z.number().nullable(),
    }),
  }),
]);
export type CenterNotification = z.infer<typeof CenterNotificationSchema>;

export const notificationApi = {
  async list() {
    const base = z
      .object({ notifications: z.array(CenterNotificationSchema) })
      .parse(await request('/v1/notifications'));
    const spy = z
      .object({ notifications: z.array(CenterNotificationSchema) })
      .parse(
        await request(
          `/api/spy-notifications${process.env.NEXT_PUBLIC_TMX_LOCAL_PREVIEW_KIND === 'synthetic' && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('spy_notice_test') === '1' ? '?fixture=1' : ''}`,
        ).catch(() => ({ notifications: [] })),
      );
    return {
      notifications: [...base.notifications, ...spy.notifications].sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      ),
    };
  },
  async read(ids: string[]) {
    const local = ids.filter((id) => id.startsWith('spy:'));
    for (let offset = 0; offset < local.length; offset += 500)
      await request('/api/spy-notifications', {
        method: 'POST',
        body: { ids: local.slice(offset, offset + 500) },
      });
    const remoteIds = ids.filter((id) => !id.startsWith('spy:'));
    for (let offset = 0; offset < remoteIds.length; offset += 500)
      await request('/v1/notifications/read', {
        method: 'POST',
        body: { ids: remoteIds.slice(offset, offset + 500) },
      });
  },
  async clearSales() {
    return request('/v1/notifications/clear-sales', { method: 'POST', body: { all: true } });
  },
  async status(id: string, status: TaskStatus, key: string, revision?: number) {
    return request(`/v1/notifications/tasks/${encodeURIComponent(id)}/status`, {
      method: 'POST',
      body: { status, revision },
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
