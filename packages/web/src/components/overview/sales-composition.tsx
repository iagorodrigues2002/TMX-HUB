'use client';

import { request } from '@/lib/api-client/request';
import { useAuth } from '@/lib/auth-context';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

const totals = z.object({
  orders: z.number(),
  fronts: z.number(),
  upsells: z.number(),
  customers: z.number(),
  unidentified_orders: z.number(),
  missing_amounts: z.number(),
  revenue_brl_minor: z.string(),
  arr_brl_minor: z.string().nullable(),
});
const response = z.object({
  offers: z.array(
    z.object({
      offer_id: z.string(),
      general: totals,
      natural: totals,
      unclassified_orders: z.number(),
    }),
  ),
});
export function useSalesComposition(from: string, to: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['sales-composition', user?.id, user?.role, from, to],
    queryFn: async () =>
      response.parse(await request(`/v1/tracking/sales-composition?from=${from}&to=${to}`)),
    enabled: Boolean(user),
    staleTime: 30000,
    retry: false,
  });
}

// General uses front purchases; natural keeps unique clients within the selected period.
export function periodArpu(
  data: z.infer<typeof response> | undefined,
  ids: string[],
  mode: 'general' | 'natural',
) {
  if (!data) return null;
  const rows = ids.map((id) => data.offers.find((o) => o.offer_id === id)?.[mode]);
  if (rows.some((r) => !r || r.missing_amounts || (mode === 'natural' && r.unidentified_orders)))
    return null;
  const denominator = rows.reduce((n, r) => n + (mode === 'general' ? r!.fronts : r!.customers), 0);
  const revenue = rows.reduce((n, r) => n + Number(r!.revenue_brl_minor), 0);
  return denominator ? Math.round(revenue / denominator) / 100 : null;
}
