'use client';

import { OverviewDashboard } from '@/components/overview/overview-dashboard';
import { TRACKING_DASHBOARD_STALE_TIME } from '@/components/tracking/tracking-query';
import { DataState } from '@/components/ui/data-state';
import { apiClient } from '@/lib/api-client';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, CircleAlert, RadioTower, Webhook } from 'lucide-react';

interface OverviewSectionProps {
  offerId: string;
  canManage: boolean;
  section: string;
}

export function OverviewSection({ offerId, section }: OverviewSectionProps) {
  const config = useQuery({
    queryKey: ['tracking-config', offerId],
    queryFn: () => apiClient.getTrackingConfig(offerId),
    enabled: section !== 'summary',
    retry: false,
    staleTime: TRACKING_DASHBOARD_STALE_TIME,
  });

  if (section === 'summary') {
    return <OverviewDashboard scope="offer" offerId={offerId} />;
  }

  if (config.isLoading) {
    return <DataState variant="loading" title="Verificando saúde da oferta…" />;
  }
  if (config.isError || !config.data) {
    return (
      <DataState
        variant="error"
        title="Não foi possível verificar a oferta"
        description="O resumo não foi alterado. Tente consultar a saúde novamente."
        onRetry={() => void config.refetch()}
        isRetrying={config.isFetching}
      />
    );
  }

  const checks = [
    {
      label: 'Captura first-party',
      ready: config.data.configured,
      detail: config.data.configured
        ? 'Infraestrutura criada'
        : 'Ative a captura em Código e pixels',
      icon: RadioTower,
    },
    {
      label: 'Webhook VendePay',
      ready: Boolean(config.data.vendepay?.configured),
      detail: config.data.vendepay?.configured
        ? 'Conexão disponível para eventos'
        : 'Conecte em Gateways e webhooks',
      icon: Webhook,
    },
  ];

  return (
    <section className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-5">
      <h2 className="text-base font-semibold text-white">Saúde e alertas</h2>
      <p className="mt-1 text-sm text-white/50">
        Prontidão essencial da oferta, sem repetir o console de diagnóstico.
      </p>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {checks.map(({ label, ready, detail, icon: Icon }) => (
          <div key={label} className="rounded-lg border border-white/[0.08] bg-black/10 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-white/80">{label}</p>
              {ready ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-300" />
              ) : (
                <CircleAlert className="h-4 w-4 text-amber-200" />
              )}
            </div>
            <div className="mt-3 flex items-center gap-2 text-xs text-white/50">
              <Icon className="h-4 w-4" /> {detail}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
