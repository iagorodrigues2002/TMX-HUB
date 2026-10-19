'use client';

import { DataState } from '@/components/ui/data-state';
import dynamic from 'next/dynamic';

export const TrackingCountryMap = dynamic(
  () =>
    import('@/components/tracking/tracking-country-map').then(
      (module) => module.TrackingCountryMap,
    ),
  {
    loading: () => <DataState className="min-h-64" variant="loading" title="Carregando mapa…" />,
  },
);

export type View = 'tracker' | 'funnel' | 'attribution' | 'infrastructure';

export function money(minor: string | number | undefined, currency = 'BRL') {
  const value = Number(minor ?? 0) / 100;
  const normalizedCurrency = /^[A-Z]{3}$/.test(currency.trim().toUpperCase())
    ? currency.trim().toUpperCase()
    : 'BRL';

  try {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: normalizedCurrency,
    }).format(Number.isFinite(value) ? value : 0);
  } catch {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(Number.isFinite(value) ? value : 0);
  }
}

export function percentage(value: number, total: number) {
  if (!total) return '0%';
  return `${((value / total) * 100).toFixed(1).replace('.', ',')}%`;
}

export function shortId(value?: string) {
  if (!value) return 'sem indexador';
  return value.length > 16 ? `${value.slice(0, 8)}…${value.slice(-5)}` : value;
}
