export function pushcutOrderSelected(kind: string | null, selected: string[] | null): boolean {
  return selected == null || (kind != null && selected.includes(kind));
}

export function isPushcutUpsell(kind: string | null): boolean {
  return kind === 'upsell' || /^upsell_([2-9]|[1-9][0-9]+)$/.test(kind ?? '');
}
import { z } from 'zod';

export const PushcutProfileSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    secret: z.string().trim().min(8).max(256).optional(),
    source_destination_id: z.string().min(1).optional(),
    front_notification_name: z.string().trim().max(200),
    upsell_notification_name: z.string().trim().min(1).max(200).nullable(),
    devices: z.array(z.string().trim().min(1).max(120)).max(20),
    offer_ids: z
      .array(z.string().min(1))
      .max(200)
      .refine((ids) => new Set(ids).size === ids.length),
    order_kinds: z
      .array(z.string().regex(/^(front|upsell|upsell_([2-9]|[1-9][0-9]+))$/))
      .min(1)
      .max(30),
    show_amount: z.boolean(),
    enabled: z.boolean(),
  })
  .refine((p) => p.upsell_notification_name || p.order_kinds.every((kind) => kind === 'front'), {
    message: 'Informe a notificação de upsell para os estágios selecionados.',
  })
  .refine((p) => !p.order_kinds.includes('front') || Boolean(p.front_notification_name), {
    message: 'Informe a notificação de front para receber vendas principais.',
  });
