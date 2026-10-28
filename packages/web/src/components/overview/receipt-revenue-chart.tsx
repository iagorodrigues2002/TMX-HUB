'use client';

import { request } from '@/lib/api-client/request';
import { useAuth } from '@/lib/auth-context';
import type { DateRange } from '@/lib/date-range';
import { useQueries } from '@tanstack/react-query';
import { useState } from 'react';
import { RevenueChart } from './overview-dashboard-revenue-chart';

interface ReceiptRevenue {
  missing_currency: number;
  hours: { hour: number; sales: number; revenue_brl_minor: number }[];
  by_kind?: Record<'front' | 'upsell' | 'unknown', Omit<ReceiptRevenue, 'by_kind'>>;
}

export function ReceiptRevenueChart({
  offerIds,
  period,
  animated,
}: { offerIds: string[]; period: DateRange; animated: boolean }) {
  const { user } = useAuth();
  const [kind, setKind] = useState<'all' | 'front' | 'upsell'>('all');
  const scopedOffers = [...new Set(offerIds)];
  const queries = useQueries({
    queries: scopedOffers.map((id) => ({
      queryKey: ['receipt-revenue', user?.id, user?.role, id, period.from, period.to],
      enabled: Boolean(user),
      queryFn: () =>
        request<ReceiptRevenue>(
          `/v1/offers/${id}/tracking/receipt-revenue?${new URLSearchParams({ from: period.from, to: period.to })}`,
        ),
      retry: false,
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    })),
  });
  const unavailable = queries.some(
    (query) => query.isError || (kind !== 'all' && query.data && !query.data.by_kind),
  );
  const loading = queries.some((query) => query.isPending);
  const unclassified = queries.reduce(
    (sum, query) =>
      sum + (query.data?.by_kind?.unknown.hours.reduce((total, row) => total + row.sales, 0) ?? 0),
    0,
  );
  const series = queries.map((query) =>
    kind === 'all' ? query.data : query.data?.by_kind?.[kind],
  );
  const missing = series.reduce((sum, data) => sum + (data?.missing_currency ?? 0), 0);
  const points =
    !unavailable && !loading && !missing && offerIds.length
      ? Array.from({ length: 24 }, (_, hour) => ({
          key: String(hour),
          label: `${String(hour).padStart(2, '0')}:00`,
          value:
            series.reduce(
              (sum, data) =>
                sum + (data?.hours.find((row) => row.hour === hour)?.revenue_brl_minor ?? 0),
              0,
            ) / 100,
          secondary: series.reduce(
            (sum, data) => sum + (data?.hours.find((row) => row.hour === hour)?.sales ?? 0),
            0,
          ),
        }))
      : [];
  return (
    <RevenueChart
      title="Receita por hora"
      controls={
        <fieldset aria-label="Tipo de venda" className="mt-3 flex gap-2">
          {(['all', 'front', 'upsell'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={kind === value}
              onClick={() => setKind(value)}
              className={`rounded-md border px-3 py-1.5 text-xs ${kind === value ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground'}`}
            >
              {value === 'all' ? 'Todos' : value === 'front' ? 'Fronts' : 'Upsells'}
            </button>
          ))}
        </fieldset>
      }
      description={`Primeiro webhook aprovado · horário de São Paulo${period.from !== period.to ? ' · horas somadas nos dias do período' : ''}. Reenvios não somam novamente.${unclassified ? ` Todos inclui ${unclassified} vendas ainda sem classificação de front/upsell.` : ''}`}
      emptyMessage={
        loading
          ? 'Consultando recebimentos…'
          : missing
            ? `${missing} vendas sem conversão BRL: receita indisponível para evitar um total parcial.`
            : unavailable
              ? 'Consulta de recebimentos indisponível. A API precisa disponibilizar esta versão; snapshots não serão usados como substituição.'
              : 'Nenhum recebimento disponível.'
      }
      points={points}
      currency="BRL"
      animated={animated}
    />
  );
}
