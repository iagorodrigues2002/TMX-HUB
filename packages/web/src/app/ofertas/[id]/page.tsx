'use client';

import { HubShell } from '@/components/hub/hub-shell';
import { OfferAiAnalysis } from '@/components/ofertas/offer-ai-analysis';
import { OfferCard } from '@/components/ofertas/offer-card';
import { OfferEditDialog } from '@/components/ofertas/offer-edit-dialog';
import { Button } from '@/components/ui/button';
import { DataState } from '@/components/ui/data-state';
import { DateRangeFilter } from '@/components/ui/date-range-filter';
import { PERIOD_DATE_PRESETS, todayIso } from '@/lib/date-range';
import { ArrowLeft, ChevronDown, Loader2, Pencil, Target } from 'lucide-react';
import Link from 'next/link';
import { renderSnapshotMetrics } from './page-render-snapshot-metrics';
import { useOfertaDetailPageState } from './page-use-oferta-detail-page-state';

export default function OfertaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const {
    id,
    canManage,
    canUseAi,
    period,
    setPeriod,
    from,
    to,
    editing,
    setEditing,
    adSearch,
    setAdSearch,
    compareLeft,
    setCompareLeft,
    compareRight,
    setCompareRight,
    intradayMode,
    setIntradayMode,
    setIntradayPeriod,
    intradayFrom,
    intradayTo,
    intradayAdWindow,
    setIntradayAdWindow,
    intradayAdSearch,
    setIntradayAdSearch,
    adCompareLeft,
    setAdCompareLeft,
    adCompareRight,
    setAdCompareRight,
    offerQuery,
    offer,
    capabilitiesQuery,
    snapshotsQuery,
    data,
    isIntradayRange,
    intradayQuery,
    intraday,
    adsetTotals,
    adTotals,
    offerName,
    currency,
    money,
    availableWindows,
    leftWindow,
    rightWindow,
    currentWindow,
    selectedAdWindow,
    filteredIntradayAds,
    availableAdWindows,
    leftAdWindow,
    rightAdWindow,
    comparedAds,
  } = useOfertaDetailPageState({ params });

  if (offerQuery.isLoading) {
    return (
      <HubShell breadcrumb={['OFERTAS', 'CARREGANDO']}>
        <DataState variant="loading" title="Carregando oferta…" />
      </HubShell>
    );
  }

  if (offerQuery.isError && !offer) {
    return (
      <HubShell breadcrumb={['OFERTAS', 'ERRO']}>
        <DataState
          variant="error"
          title="Não foi possível carregar a oferta"
          description="A identificação e as permissões da oferta não puderam ser confirmadas."
          isRetrying={offerQuery.isFetching}
          onRetry={() => void offerQuery.refetch()}
        />
      </HubShell>
    );
  }

  if (offerQuery.isSuccess && !offer) {
    return (
      <HubShell breadcrumb={['OFERTAS', 'NÃO ENCONTRADA']}>
        <DataState
          variant="empty"
          title="Oferta não encontrada"
          description="Ela pode ter sido removida ou não estar liberada para sua conta."
          action={
            <Button asChild size="sm" variant="outline">
              <Link href="/ofertas">Voltar para ofertas</Link>
            </Button>
          }
        />
      </HubShell>
    );
  }

  return (
    <HubShell breadcrumb={['OFERTAS', offerName]}>
      <div className="mb-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/ofertas" className="gap-1">
            <ArrowLeft className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-[0.18em]">
              Todas as ofertas
            </span>
          </Link>
        </Button>
      </div>

      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-cyan-300" />
            <p className="hud-label">Oferta</p>
          </div>
          <h1 className="break-words text-3xl font-bold tracking-tight text-white">{offerName}</h1>
          {offer?.dashboardId && canManage && (
            <p className="break-all font-mono text-xs text-white/40">
              utmify dashboardId: {offer.dashboardId} · moeda: {currency}
            </p>
          )}
        </div>
        {offer && canManage && (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5" />
            Editar oferta
          </Button>
        )}
      </header>

      {/* Identidade + links da oferta (mesmo card da listagem, em destaque) */}
      {offer && (
        <section className="mb-6">
          <OfferCard offer={offer} {...(canManage ? { onEdit: () => setEditing(true) } : {})} />
        </section>
      )}

      {offer?.utmifyConfigured && canManage && (
        <details className="glass-card group mb-6 overflow-hidden p-0">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 [&::-webkit-details-marker]:hidden">
            <div>
              <p className="hud-label">Conta de anúncios via UTMify</p>
              <p className="mt-1 text-xs text-white/55">
                {capabilitiesQuery.data?.accountFields.length ?? 0} conta(s) identificada(s) ·
                clique para abrir
              </p>
            </div>
            {capabilitiesQuery.isFetching ? (
              <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
            ) : (
              <ChevronDown className="h-4 w-4 text-white/45 transition-transform group-open:rotate-180" />
            )}
          </summary>
          <div className="border-t border-white/[0.06] px-4 pb-4">
            {capabilitiesQuery.data?.accountFields.length ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {capabilitiesQuery.data.accountFields.map((account, index) => (
                  <div
                    key={JSON.stringify(account)}
                    className="rounded-lg border border-white/[0.06] bg-black/10 px-3 py-3"
                  >
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-300/70">
                      Conta {index + 1}
                    </p>
                    <div className="space-y-2">
                      {Object.entries(account).map(([key, value]) => (
                        <div key={key}>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">
                            {key === 'accountId'
                              ? 'ID da conta'
                              : key === 'accountStatus'
                                ? 'Status da conta'
                                : key}
                          </p>
                          <p className="mt-1 truncate font-mono text-xs text-white/80">
                            {String(value)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : capabilitiesQuery.isSuccess ? (
              <p className="mt-3 text-xs text-amber-200/75">
                O endpoint de anúncios não retornou nome nem status da conta neste período.
              </p>
            ) : capabilitiesQuery.isError ? (
              <p className="mt-3 text-xs text-danger/75">
                Não foi possível inspecionar os campos da conta agora.
              </p>
            ) : null}
          </div>
        </details>
      )}

      <h2 className="mb-3 text-[16px] font-semibold text-white">Métricas</h2>

      {/* Filter */}
      <DateRangeFilter
        value={period}
        onChange={setPeriod}
        presets={PERIOD_DATE_PRESETS}
        max={todayIso()}
        className="mb-4"
        status={
          snapshotsQuery.isFetching ? (
            <span className="inline-flex items-center gap-2 pb-2 text-xs text-cyan-200/70">
              <Loader2 className="h-4 w-4 animate-spin" /> Atualizando
            </span>
          ) : null
        }
      />

      {snapshotsQuery.isLoading ? (
        <DataState variant="loading" title="Carregando métricas da oferta…" />
      ) : snapshotsQuery.isError && !data ? (
        <DataState
          variant="error"
          title="Não foi possível carregar as métricas"
          description="O cabeçalho da oferta foi preservado. Tente recarregar somente esta seção."
          isRetrying={snapshotsQuery.isFetching}
          onRetry={() => void snapshotsQuery.refetch()}
        />
      ) : !data ? (
        <DataState
          variant="empty"
          title="Sem métricas neste período"
          description="Altere as datas ou aguarde a próxima sincronização UTMify."
        />
      ) : (
        renderSnapshotMetrics({
          adSearch,
          setAdSearch,
          snapshotsQuery,
          data,
          adsetTotals,
          adTotals,
          currency,
          money,
        })
      )}

      {renderIntradaySection({
        from,
        to,
        compareLeft,
        setCompareLeft,
        compareRight,
        setCompareRight,
        intradayMode,
        setIntradayMode,
        setIntradayPeriod,
        intradayFrom,
        intradayTo,
        intradayAdWindow,
        setIntradayAdWindow,
        intradayAdSearch,
        setIntradayAdSearch,
        adCompareLeft,
        setAdCompareLeft,
        adCompareRight,
        setAdCompareRight,
        isIntradayRange,
        intradayQuery,
        intraday,
        currency,
        money,
        availableWindows,
        leftWindow,
        rightWindow,
        currentWindow,
        selectedAdWindow,
        filteredIntradayAds,
        availableAdWindows,
        leftAdWindow,
        rightAdWindow,
        comparedAds,
      })}

      {canUseAi && <OfferAiAnalysis offerId={id} />}

      {offer && canManage && (
        <OfferEditDialog offer={offer} open={editing} onOpenChange={setEditing} />
      )}
    </HubShell>
  );
}
export const dynamic = 'force-dynamic';

import { renderIntradaySection } from './page-render-intraday-section';
