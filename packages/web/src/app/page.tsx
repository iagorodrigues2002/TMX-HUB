'use client';

import { KpiGrid, formatCurrency, formatInt, formatRoas } from '@/components/dashboard/kpi-cards';
import { HubShell } from '@/components/hub/hub-shell';
import { ToolCard } from '@/components/hub/tool-card';
import { Button } from '@/components/ui/button';
import { DataState } from '@/components/ui/data-state';
import { DateRangeFilter } from '@/components/ui/date-range-filter';
import { apiClient, canAccessTool } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { DASHBOARD_DATE_PRESETS, rollingDateRange } from '@/lib/date-range';
import { visibleToolCatalog } from '@/lib/tool-catalog';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Plus, ScrollText } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

export const dynamic = 'force-dynamic';

export default function HubLandingPage() {
  const { user } = useAuth();
  const [period, setPeriod] = useState(() => rollingDateRange(7));
  const { from, to } = period;
  const hasOffers = canAccessTool(user, 'ofertas');
  const homeTools = visibleToolCatalog(user, { homeOnly: true });

  const {
    data: summary,
    isLoading: summaryLoading,
    isError: summaryError,
    isFetching: summaryFetching,
    refetch,
  } = useQuery({
    queryKey: ['dashboard-summary', from, to],
    queryFn: () => apiClient.getDashboardSummary({ from, to }),
    enabled: Boolean(user) && hasOffers,
    refetchOnWindowFocus: false,
  });

  const firstName = user?.name?.split(/\s+/)[0] ?? 'Operador';

  return (
    <HubShell>
      <header className="tmx-command-hero rounded-2xl border border-cyan-300/15 p-5 sm:p-7 md:p-8">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <p className="hud-label">Operator Console</p>
          <span className="flex items-center gap-2 rounded-full border border-emerald-300/15 bg-emerald-300/[0.05] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-emerald-200/70">
            <span className="status-dot" aria-hidden /> Sistema online
          </span>
        </div>
        <h1 className="text-3xl font-bold leading-tight tracking-tight text-white md:text-4xl">
          Olá,{' '}
          <span
            className="bg-clip-text text-transparent"
            style={{
              backgroundImage:
                'linear-gradient(90deg, var(--accent-from) 0%, var(--accent-to) 100%)',
            }}
          >
            {firstName}
          </span>
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-white/55">
          {hasOffers
            ? 'Visão geral separada por conta. Use os filtros pra mudar o período.'
            : 'Seu espaço de trabalho mostra somente as ferramentas liberadas pelo administrador.'}
        </p>
      </header>

      {hasOffers && (
        <>
          {/* Filter bar */}
          <section className="mt-8">
            <DateRangeFilter
              value={period}
              onChange={setPeriod}
              presets={DASHBOARD_DATE_PRESETS}
              isRefreshing={summaryFetching}
              onRefresh={() => void refetch()}
            />
          </section>

          {/* Account-isolated KPIs */}
          <section className="mt-6">
            {summaryLoading ? (
              <DataState variant="loading" title="Carregando resumo das contas…" />
            ) : summaryError && !summary ? (
              <DataState
                variant="error"
                title="Não foi possível carregar o dashboard"
                description="Verifique sua conexão e tente consultar o período novamente."
                isRetrying={summaryFetching}
                onRetry={() => void refetch()}
              />
            ) : summary?.accounts.length === 0 ? (
              <DataState
                variant="empty"
                title="Nenhuma oferta disponível neste período"
                description="Cadastre ou revise suas ofertas para começar a centralizar links e métricas."
                action={
                  <Button asChild size="sm">
                    <Link href="/ofertas">
                      <Plus className="h-3.5 w-3.5" />
                      Ir para ofertas
                    </Link>
                  </Button>
                }
              />
            ) : (
              <div className="space-y-6">
                {summary?.accounts.map((account) => (
                  <section
                    key={account.ownerId}
                    className="space-y-3 rounded-xl border border-cyan-300/[0.14] bg-cyan-300/[0.025] p-3 sm:p-4"
                  >
                    <div className="flex items-center justify-between gap-3 border-b border-cyan-300/[0.1] pb-3">
                      <div>
                        <p className="hud-label">Resumo da conta</p>
                        <h2 className="mt-1 text-base font-semibold text-white">
                          {account.ownerName}
                        </h2>
                      </div>
                      <span className="rounded-full border border-cyan-300/20 bg-cyan-300/[0.06] px-3 py-1 text-xs text-cyan-100/70">
                        {account.offers.length} {account.offers.length === 1 ? 'oferta' : 'ofertas'}
                      </span>
                    </div>
                    {account.currencyTotals.map(({ currency, totals }) => (
                      <div key={currency}>
                        <p className="hud-label mb-2">Resumo em {currency}</p>
                        <KpiGrid metrics={totals} currency={currency} />
                      </div>
                    ))}
                  </section>
                ))}
              </div>
            )}
          </section>

          {/* Per-offer cards */}
          {summary && summary.accounts.length > 0 && (
            <section className="mt-8">
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-white/55">
                  Ofertas por conta
                </h2>
                <Link
                  href="/ofertas"
                  className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300 hover:text-cyan-200"
                >
                  Gerenciar →
                </Link>
              </div>

              <div className="space-y-6">
                {summary.accounts.map((account) => (
                  <section key={account.ownerId} className="space-y-3">
                    <div className="flex items-center gap-2 px-1">
                      <span className="hud-label">Conta</span>
                      <span className="text-xs font-medium text-cyan-100/80">
                        {account.ownerName}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {account.offers.map((entry) => (
                        <Link
                          key={entry.offer.id}
                          href={`/ofertas/${entry.offer.id}`}
                          className="glass-card flex flex-col gap-3 p-4 transition hover:border-cyan-300/30"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <h3 className="truncate text-base font-semibold text-white">
                              {entry.offer.name}
                            </h3>
                            <ArrowRight className="h-4 w-4 shrink-0 text-cyan-300/70" />
                          </div>
                          <dl className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <dt className="hud-label">Vendas</dt>
                              <dd className="mt-0.5 font-mono text-emerald-300">
                                {formatInt(entry.totals.sales)}
                              </dd>
                            </div>
                            <div>
                              <dt className="hud-label">Faturamento</dt>
                              <dd className="mt-0.5 font-mono text-emerald-300">
                                {formatCurrency(entry.totals.revenue, entry.offer.currency)}
                              </dd>
                            </div>
                            <div>
                              <dt className="hud-label">Investido</dt>
                              <dd className="mt-0.5 font-mono text-amber-300">
                                {formatCurrency(entry.totals.spend, entry.offer.currency)}
                              </dd>
                            </div>
                            <div>
                              <dt className="hud-label">ROAS</dt>
                              <dd className="mt-0.5 font-mono text-cyan-300">
                                {formatRoas(entry.totals.roas)}
                              </dd>
                            </div>
                          </dl>
                          <p className="text-[10px] uppercase tracking-[0.14em] text-white/40">
                            {entry.snapshotsCount} snapshot(s) no período
                          </p>
                        </Link>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {/* Tools */}
      <section className="mt-12">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-white/55">
            Ferramentas
          </h2>
          <Link
            href="/tools"
            className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300 hover:text-cyan-200"
          >
            Ver todas →
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {homeTools.map(({ id, icon: Icon, title, description, href, badge, disabled }) => (
            <ToolCard
              key={id}
              icon={<Icon className="h-6 w-6" />}
              title={title}
              description={description}
              href={href}
              badge={badge}
              disabled={disabled}
            />
          ))}
        </div>
      </section>

      {canAccessTool(user, 'logs') && (
        <div className="mt-12 flex justify-end">
          <Button asChild variant="ghost" size="sm">
            <Link href="/logs">
              <ScrollText className="h-3.5 w-3.5" />
              Atividade
            </Link>
          </Button>
        </div>
      )}

      <div className="h-16" aria-hidden />
    </HubShell>
  );
}
