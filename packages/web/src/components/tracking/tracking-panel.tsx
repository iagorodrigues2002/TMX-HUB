'use client';

import { TRACKING_DASHBOARD_STALE_TIME } from '@/components/tracking/tracking-query';
import { Button } from '@/components/ui/button';
import { DataState } from '@/components/ui/data-state';
import { apiClient } from '@/lib/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, CheckCircle2, Copy, Radio } from 'lucide-react';
import { toast } from 'sonner';

const META_URL_PARAMETERS =
  'utm_source={{site_source_name}}&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}&campaign_id={{campaign.id}}&adset_id={{adset.id}}&ad_id={{ad.id}}&placement={{placement}}&site_source_name={{site_source_name}}';

export function TrackingPanel({ offerId, canManage }: { offerId: string; canManage: boolean }) {
  const queryClient = useQueryClient();
  const config = useQuery({
    queryKey: ['tracking-config', offerId],
    queryFn: () => apiClient.getTrackingConfig(offerId),
    retry: false,
    staleTime: TRACKING_DASHBOARD_STALE_TIME,
  });
  const summary = useQuery({
    queryKey: ['tracking-summary', offerId],
    queryFn: () => apiClient.getTrackingSummary(offerId),
    enabled: Boolean(config.data?.configured),
    refetchInterval: 30_000,
    retry: false,
    staleTime: TRACKING_DASHBOARD_STALE_TIME,
  });
  const setup = useMutation({
    mutationFn: () => apiClient.setupTracking(offerId),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['tracking-config', offerId] });
      void queryClient.invalidateQueries({ queryKey: ['tracking-summary', offerId] });
      toast.success(
        result.already_configured
          ? 'Tracking existente recuperado sem criar duplicidade.'
          : 'Captura first-party criada.',
      );
    },
    onError: (error) => toast.error((error as Error).message),
  });
  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value);
    toast.success('Copiado.');
  };

  return (
    <section className="mb-6 rounded-lg border border-cyan-300/15 bg-cyan-300/[0.035] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-cyan-300" />
            <p className="hud-label">Captura first-party</p>
          </div>
          <p className="mt-2 text-sm text-white/55">
            Instale o código uma vez para receber eventos diretamente no TMX.
          </p>
        </div>
      </div>

      {config.isLoading ? (
        <DataState className="mt-5" variant="loading" title="Carregando captura…" />
      ) : !config.data?.configured ? (
        <DataState
          className="mt-5"
          variant="empty"
          title="Captura ainda não configurada"
          description="Crie a infraestrutura first-party para liberar o script de captura."
          action={
            canManage ? (
              <Button onClick={() => setup.mutate()} disabled={setup.isPending}>
                {setup.isPending ? 'Criando…' : 'Criar configuração'}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-4">
            {[
              ['Visitas', summary.data?.page_views ?? 0],
              ['Checkouts', summary.data?.checkouts ?? 0],
              ['Pagas', summary.data?.paid_orders ?? 0],
              ['Órfãs', summary.data?.orphan_orders ?? 0],
            ].map(([label, value]) => (
              <div key={label} className="rounded-md border border-white/[0.07] bg-black/10 p-3">
                <p className="hud-label">{label}</p>
                <p className="mt-1 font-mono text-xl text-white">{value}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-3">
            <div>
              <p className="hud-label">Código de instalação</p>
              <div className="mt-1 flex gap-2">
                <code className="min-w-0 flex-1 overflow-x-auto rounded-md bg-black/30 p-3 text-[11px] text-cyan-100">
                  {config.data.project?.install_code}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Copiar código de instalação"
                  onClick={() => copy(config.data?.project?.install_code ?? '')}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div>
              <p className="hud-label">Parâmetros da URL · Meta Ads</p>
              <p className="mt-1 text-xs leading-5 text-white/45">
                Cole em “Parâmetros da URL” no anúncio. O Meta substituirá as macros e o TMX
                preservará os valores até a Vendepay.
              </p>
              <div className="mt-2 flex gap-2">
                <code className="min-w-0 flex-1 overflow-x-auto rounded-md bg-black/30 p-3 text-[11px] text-cyan-100">
                  {META_URL_PARAMETERS}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Copiar parâmetros da URL do Meta"
                  onClick={() => copy(META_URL_PARAMETERS)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-white/45">
              <span className="flex items-center gap-1 text-emerald-200">
                <CheckCircle2 className="h-3.5 w-3.5" /> Captura configurada
              </span>
              <span className="flex items-center gap-1">
                <Activity className="h-3.5 w-3.5" /> atualização a cada 30s
              </span>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
