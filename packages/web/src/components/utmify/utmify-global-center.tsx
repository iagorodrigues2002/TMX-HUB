'use client';

import { Button } from '@/components/ui/button';
import { DataState } from '@/components/ui/data-state';
import {
  Activity,
  Cable,
  CheckCircle2,
  Database,
  Loader2,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import { renderDashboardSettings } from './utmify-global-center-render-dashboard-settings';
import { MetricCard, UtmifyLoadingState } from './utmify-global-center-support';
import { useUtmifyGlobalCenterState } from './utmify-global-center-use-utmify-global-center-state';

export function UtmifyGlobalCenter() {
  const {
    config,
    form,
    setForm,
    selectedOfferIds,
    setSelectedOfferIds,
    offerRoutesDirty,
    setOfferRoutesDirty,
    attemptedSave,
    save,
    test,
    replay,
    saveOfferRoutes,
    stats,
    hasPeriodData,
    deliveryRate,
    nameError,
    tokenError,
    pixelError,
    endpointError,
    handleSave,
  } = useUtmifyGlobalCenterState();

  return (
    <div className="signal-reveal space-y-6">
      <header className="tmx-command-hero rounded-2xl border border-cyan-300/15 bg-gradient-to-br from-cyan-300/[0.09] via-white/[0.025] to-transparent p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <div className="mb-4 flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-xl border border-cyan-300/25 bg-cyan-300/[0.08]">
                <Cable className="h-5 w-5 text-cyan-300" />
              </div>
              <div>
                <p className="hud-label">TMX · UTMify Hub</p>
                <p className="mt-1 text-xs text-emerald-200/70">Camada agregadora multi-oferta</p>
              </div>
            </div>
            <h1 className="text-3xl font-bold text-white md:text-4xl">UTMify Geral</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/50">
              Uma segunda camada recebe pedidos e InitiateCheckout de todas as ofertas, sem
              substituir ou misturar as integrações individuais.
            </p>
          </div>
          <Button
            variant="outline"
            disabled={config.isFetching}
            onClick={() => void config.refetch()}
            className="gap-2 border-white/10"
          >
            <RefreshCw className={config.isFetching ? 'animate-spin' : ''} />
            {config.isFetching ? 'Atualizando' : 'Atualizar'}
          </Button>
        </div>
      </header>

      {config.isLoading ? (
        <UtmifyLoadingState />
      ) : config.isError && !config.data ? (
        <DataState
          variant="error"
          title="Não foi possível carregar a UTMify Geral"
          description="A configuração não foi liberada para edição porque os dados atuais não puderam ser confirmados."
          isRetrying={config.isFetching}
          onRetry={() => void config.refetch()}
        />
      ) : config.data ? (
        <>
          {config.isError && (
            <output
              aria-live="polite"
              className="block rounded-xl border border-warning/25 bg-warning/[0.07] px-4 py-3 text-sm text-warning"
            >
              Não foi possível atualizar agora. Exibindo a última configuração carregada.
            </output>
          )}

          {hasPeriodData && stats ? (
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard icon={Database} label="Pedidos · 7 dias" value={stats.orders_7d} />
              <MetricCard icon={CheckCircle2} label="Entregues" value={stats.orders_delivered_7d} />
              <MetricCard
                icon={Activity}
                label="Eventos web"
                value={stats.web_events_delivered_7d}
              />
              <MetricCard
                icon={stats.orders_failed_7d ? TriangleAlert : ShieldCheck}
                label="Saúde de envio"
                value={deliveryRate}
              />
            </section>
          ) : (
            <DataState
              variant="empty"
              title="Sem dados no período"
              description="Nenhum pedido ou evento web foi entregue pela UTMify Geral nos últimos 7 dias."
            />
          )}

          {renderDashboardSettings({
            dashboardConfig: config.data,
            config,
            form,
            setForm,
            attemptedSave,
            save,
            test,
            replay,
            nameError,
            tokenError,
            pixelError,
            endpointError,
            handleSave,
          })}

          <section className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="font-semibold text-white">Ofertas enviadas à dashboard geral</h2>
                <p className="mt-1 max-w-2xl text-xs leading-5 text-white/45">
                  Escolha quais ofertas podem enviar pedidos e eventos de checkout para esta UTMify
                  Geral. As integrações individuais de cada oferta continuam independentes.
                </p>
              </div>
              <p className="rounded-full border border-cyan-300/20 bg-cyan-300/[0.07] px-3 py-1 font-mono text-xs text-cyan-100">
                {selectedOfferIds.length} de {config.data.offers.length} selecionadas
              </p>
            </div>
            {!config.data.offers.length ? (
              <p className="mt-5 text-sm text-white/40">
                Nenhuma oferta com tracking ativo foi encontrada.
              </p>
            ) : (
              <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {config.data.offers.map((offer) => {
                  const checked = selectedOfferIds.includes(offer.id);
                  return (
                    <label
                      key={offer.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${checked ? 'border-cyan-300/35 bg-cyan-300/[0.07]' : 'border-white/[0.08] bg-black/10 hover:border-white/20'}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setOfferRoutesDirty(true);
                          setSelectedOfferIds((current) =>
                            checked
                              ? current.filter((offerId) => offerId !== offer.id)
                              : [...current, offer.id],
                          );
                        }}
                        className="h-4 w-4 accent-cyan-300"
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-white">
                          {offer.company_name || 'Empresa não cadastrada'}
                        </span>
                        <span className="block truncate text-[11px] text-white/50">
                          {offer.name}
                        </span>
                        <span className="block truncate font-mono text-[10px] text-white/30">
                          {offer.id}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
            <div className="mt-4 flex justify-end">
              <Button
                type="button"
                onClick={() => saveOfferRoutes.mutate()}
                disabled={saveOfferRoutes.isPending || !offerRoutesDirty}
              >
                {saveOfferRoutes.isPending && <Loader2 className="animate-spin" />}
                {saveOfferRoutes.isPending ? 'Salvando…' : 'Salvar ofertas selecionadas'}
              </Button>
            </div>
          </section>

          <section className="rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.035] p-5 text-sm leading-6 text-white/55">
            <p className="flex items-center gap-2 font-medium text-emerald-200">
              <ShieldCheck className="h-4 w-4" /> Roteamento em paralelo e com filtro
            </p>
            <p className="mt-2">
              Oferta selecionada → UTMify individual da oferta{' '}
              <span className="text-white/25">+</span> UTMify Geral. Ofertas desmarcadas continuam
              no TMX e em seus destinos individuais, mas deixam de enviar dados novos à dashboard
              geral.
            </p>
          </section>
        </>
      ) : null}
    </div>
  );
}
