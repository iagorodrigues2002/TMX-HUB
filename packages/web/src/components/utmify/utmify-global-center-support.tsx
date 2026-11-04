'use client';

import type { Database } from 'lucide-react';

export const DEFAULT_FORM = {
  name: 'UTMify Geral',
  api_token: '',
  endpoint_url: 'https://api.utmify.com.br/api-credentials/orders',
  pixel_id: '',
  enabled: true,
};

export function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Database;
  label: string;
  value: string | number;
}) {
  return (
    <div className="glass-card rounded-xl border border-border bg-muted p-4">
      <Icon className="h-4 w-4 text-primary" />
      <p className="mt-4 font-mono text-2xl tabular-nums text-foreground">{value}</p>
      <p className="mt-1 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">{label}</p>
    </div>
  );
}

export function UtmifyLoadingState() {
  const skeletons = ['pedidos', 'entregues', 'eventos', 'saude'];

  return (
    <output
      aria-live="polite"
      aria-label="Carregando configuração da UTMify Geral"
      className="block"
    >
      <section className="grid animate-pulse gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {skeletons.map((skeleton) => (
          <div
            key={skeleton}
            className="glass-card h-28 rounded-xl border border-border bg-muted"
          />
        ))}
      </section>
      <div className="glass-card mt-6 h-72 animate-pulse rounded-2xl border border-border bg-muted" />
    </output>
  );
}
