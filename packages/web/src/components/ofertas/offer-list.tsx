'use client';

import { formatCurrency, formatRoas } from '@/components/dashboard/kpi-cards';
import { Button } from '@/components/ui/button';
import { DataState } from '@/components/ui/data-state';
import { DateRangeFilter } from '@/components/ui/date-range-filter';
import { Kpi } from '@/components/ui/kpi';
import { PERIOD_DATE_PRESETS } from '@/lib/date-range';
import { ArrowRight, Building2, Plus, Receipt, RefreshCw, TrendingUp, Wallet } from 'lucide-react';
import Link from 'next/link';
import { OfferCard } from './offer-card';
import { OfferEditDialog } from './offer-edit-dialog';
import { renderCreateOfferForm } from './offer-list-render-create-offer-form';
import { syncLabel } from './offer-list-sync-label';
import { useOfferListState } from './offer-list-use-offer-list-state';

export function OfferList() {
  const {
    user,
    period,
    showCreate,
    setShowCreate,
    companyName,
    setCompanyName,
    name,
    setName,
    dashboardId,
    setDashboardId,
    utmifyLogin,
    setUtmifyLogin,
    utmifyAccess,
    setUtmifyAccess,
    utmifyPassword,
    setUtmifyPassword,
    editing,
    setEditing,
    memberIds,
    setMemberIds,
    createAttempted,
    setCreateAttempted,
    usersQuery,
    offersQuery,
    summaryQuery,
    offers,
    changePeriod,
    createMut,
    deleteMut,
    syncMut,
    canCreate,
    createErrors,
    summary,
    animateSummaryContainer,
    filterMotionClass,
  } = useOfferListState();

  return (
    <div className="space-y-7">
      <section className="space-y-4">
        <DateRangeFilter
          value={period}
          onChange={changePeriod}
          presets={PERIOD_DATE_PRESETS}
          status={
            <>
              <p className="hud-label">Atualização automática</p>
              <p className="mt-1 text-[12px] text-emerald-300">UTMify · a cada 30 minutos</p>
            </>
          }
        />

        {summaryQuery.isLoading ? (
          <DataState variant="loading" title="Carregando resumo das ofertas…" />
        ) : summaryQuery.isError && !summary ? (
          <DataState
            variant="error"
            title="Não foi possível carregar o resumo"
            description="A lista de conexões continua abaixo. Tente consultar as métricas novamente."
            isRetrying={summaryQuery.isFetching}
            onRetry={() => void summaryQuery.refetch()}
          />
        ) : !summary ? (
          <DataState
            variant="empty"
            title="Resumo indisponível"
            description="Ainda não há métricas consolidadas para este período."
            className="animate-[tmx-tabs-content-in_180ms_ease-out_both] motion-reduce:animate-none"
          />
        ) : (
          <div className={animateSummaryContainer ? filterMotionClass : undefined}>
            <div className="space-y-3">
              {summary.accounts.map((account) => (
                <section
                  key={account.ownerId}
                  className="space-y-3 rounded-xl border border-cyan-300/[0.14] bg-cyan-300/[0.025] p-3"
                >
                  <div className="flex items-center justify-between border-b border-cyan-300/[0.1] pb-2">
                    <div>
                      <p className="hud-label">Resumo da conta</p>
                      <h2 className="mt-1 text-[15px] font-semibold text-white">
                        {account.ownerName}
                      </h2>
                    </div>
                    <span className="text-[11px] text-cyan-100/65">
                      {account.offers.length} ofertas
                    </span>
                  </div>
                  {account.currencyTotals.map(({ currency, totals }) => (
                    <div key={currency} className="grid gap-3 md:grid-cols-3">
                      <Kpi
                        label={`Investimento · ${currency}`}
                        value={formatCurrency(totals.spend, currency)}
                        icon={<Wallet className="h-4 w-4" />}
                        tone="spend"
                        variant="financial"
                      />
                      <Kpi
                        label={`Faturamento · ${currency}`}
                        value={formatCurrency(totals.revenue, currency)}
                        icon={<Receipt className="h-4 w-4" />}
                        tone="positive"
                        variant="financial"
                      />
                      <Kpi
                        label={`ROAS · ${currency}`}
                        value={formatRoas(totals.roas)}
                        icon={<TrendingUp className="h-4 w-4" />}
                        tone={totals.roas !== null && totals.roas >= 1 ? 'positive' : 'warn'}
                        variant="financial"
                      />
                    </div>
                  ))}
                </section>
              ))}
            </div>
            <div className="space-y-6">
              {summary.accounts.map((account) => (
                <section key={account.ownerId} className="space-y-3">
                  <p className="px-1 text-[12px] font-medium text-cyan-100/75">
                    Ofertas · {account.ownerName}
                  </p>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {account.offers.map((entry) => (
                      <Link
                        key={entry.offer.id}
                        href={`/ofertas/${entry.offer.id}`}
                        className={`glass-card group space-y-4 p-4 transition-[transform,box-shadow,border-color,opacity] duration-[180ms] ease-out hover:-translate-y-0.5 hover:border-cyan-300/35 hover:shadow-[0_12px_30px_rgba(34,211,238,0.12)] motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${animateSummaryContainer ? '' : filterMotionClass}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="flex items-center gap-1.5 text-[11px] text-white/45">
                              <Building2 className="h-3.5 w-3.5" />
                              {entry.offer.companyName ?? 'Operação'}
                            </p>
                            <h3 className="mt-1 truncate text-[16px] font-semibold text-white">
                              {entry.offer.name}
                            </h3>
                          </div>
                          <ArrowRight className="h-4 w-4 text-cyan-300 transition group-hover:translate-x-0.5" />
                        </div>
                        <dl className="grid gap-2 min-[380px]:grid-cols-3">
                          <div>
                            <dt className="hud-label">Investido</dt>
                            <dd className="mt-1 font-mono text-[12px] text-amber-300">
                              {formatCurrency(entry.totals.spend, entry.offer.currency)}
                            </dd>
                          </div>
                          <div>
                            <dt className="hud-label">Faturamento</dt>
                            <dd className="mt-1 font-mono text-[12px] text-emerald-300">
                              {formatCurrency(entry.totals.revenue, entry.offer.currency)}
                            </dd>
                          </div>
                          <div>
                            <dt className="hud-label">ROAS</dt>
                            <dd className="mt-1 font-mono text-[12px] text-cyan-300">
                              {formatRoas(entry.totals.roas)}
                            </dd>
                          </div>
                        </dl>
                        <p className="text-[10px] uppercase tracking-[0.13em] text-white/35">
                          Clique para abrir os ads e seus dados
                        </p>
                      </Link>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <p className="hud-label">Conexões</p>
            <h2 className="mt-1 text-[16px] font-semibold text-white">
              {offers.length} ofertas cadastradas
            </h2>
          </div>
          <Button
            size="sm"
            className="min-h-11 sm:min-h-8"
            onClick={() => setShowCreate((value) => !value)}
            variant={showCreate ? 'outline' : 'default'}
          >
            <Plus className="h-3.5 w-3.5" />
            {showCreate ? 'Cancelar' : 'Nova oferta'}
          </Button>
        </div>

        {showCreate &&
          renderCreateOfferForm({
            user,
            companyName,
            setCompanyName,
            name,
            setName,
            dashboardId,
            setDashboardId,
            utmifyLogin,
            setUtmifyLogin,
            utmifyAccess,
            setUtmifyAccess,
            utmifyPassword,
            setUtmifyPassword,
            memberIds,
            setMemberIds,
            createAttempted,
            setCreateAttempted,
            usersQuery,
            createMut,
            canCreate,
            createErrors,
          })}

        {offersQuery.isLoading ? (
          <DataState variant="loading" title="Carregando ofertas…" />
        ) : offersQuery.isError && !offersQuery.data ? (
          <DataState
            variant="error"
            title="Não foi possível carregar as ofertas"
            description="Verifique a conexão com a API e tente novamente."
            isRetrying={offersQuery.isFetching}
            onRetry={() => void offersQuery.refetch()}
          />
        ) : offers.length === 0 ? (
          <DataState
            variant="empty"
            title="Nenhuma oferta cadastrada"
            description="Cadastre sua primeira empresa e oferta para iniciar a análise."
            className="animate-[tmx-tabs-content-in_180ms_ease-out_both] motion-reduce:animate-none"
          />
        ) : (
          <>
            {offersQuery.isError && (
              <output
                aria-live="polite"
                className="mb-3 block rounded-xl border border-warning/25 bg-warning/[0.07] px-4 py-3 text-sm text-warning"
              >
                Não foi possível atualizar agora. Exibindo as últimas ofertas carregadas.
              </output>
            )}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {offers.map((offer) => (
                <div
                  key={offer.id}
                  className="space-y-2 rounded-xl transition-[transform,box-shadow] duration-[180ms] ease-out hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(34,211,238,0.12)] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                >
                  <OfferCard
                    offer={offer}
                    {...(offer.canManage
                      ? {
                          onEdit: () => setEditing(offer),
                          onDelete: () => deleteMut.mutate(offer.id),
                        }
                      : {})}
                  />
                  <div className="flex items-center justify-between px-1 text-[11px] text-white/45">
                    <span>{syncLabel(offer)}</span>
                    {offer.canManage && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => syncMut.mutate(offer.id)}
                        disabled={
                          syncMut.isPending ||
                          offer.syncStatus === 'syncing' ||
                          offer.utmifyAccessEnabled === false ||
                          !offer.utmifyConfigured
                        }
                      >
                        <RefreshCw
                          className={`h-3.5 w-3.5 ${offer.syncStatus === 'syncing' ? 'animate-spin' : ''}`}
                        />
                        Sincronizar
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {editing && (
        <OfferEditDialog offer={editing} open onOpenChange={(open) => !open && setEditing(null)} />
      )}
    </div>
  );
}
