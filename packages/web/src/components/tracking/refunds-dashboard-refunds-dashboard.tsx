'use client';

import { Button } from '@/components/ui/button';
import { DataState } from '@/components/ui/data-state';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatRefundDate, formatRefundElapsed } from '@/lib/refund-dates';
import { useState } from 'react';
import { renderRefundFilters } from './refunds-dashboard-render-refund-filters';
import { Empty, panel } from './refunds-dashboard-support';
import { useRefundsDashboardState } from './refunds-dashboard-use-refunds-dashboard-state';
import './refunds-dashboard.css';
import { RefundMonthImpact } from './refunds-month-impact';
import { RefundAnalytics, refundMoney } from './refunds-visualizations';

export function RefundsDashboard() {
  const [reportTab, setReportTab] = useState('period');
  const {
    salesView,
    setSalesView,
    workspace,
    from,
    to,
    offerId,
    setOfferId,
    product,
    setProduct,
    provider,
    setProvider,
    vendepay,
    setVendepay,
    interval,
    setInterval,
    setPage,
    isPrivate,
    offers,
    report,
    data,
    range,
    currentPage,
    companyId,
    setCompanyId,
    companies,
    companySelectionRequired,
    scopedOffers,
  } = useRefundsDashboardState();

  return (
    <div ref={workspace} className="refund-workspace space-y-6">
      <header className="refund-header">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Reembolsos e chargebacks
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Acompanhe o impacto financeiro, a evolução das devoluções e o prazo desde a compra.
          </p>
        </div>
        <div className="refund-context">
          <span className="refund-context-dot" aria-hidden="true" /> BRL · São Paulo
        </div>
      </header>
      <section className="space-y-2" aria-label="Origem das compras devolvidas">
        <fieldset className="flex flex-wrap gap-2" aria-label="Visão dos reembolsos">
          {(
            [
              ['general', 'Visão geral'],
              ['natural', 'Visão natural'],
              ['assisted', 'Com clique registrado'],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              variant={salesView === value ? 'default' : 'outline'}
              aria-pressed={salesView === value}
              onClick={() => setSalesView(value)}
            >
              {label}
            </Button>
          ))}
        </fieldset>
        <p className="text-xs text-muted-foreground">
          {salesView === 'general'
            ? 'Todas as compras, com ou sem clique operacional. Histórico sem classificação também está incluído.'
            : salesView === 'natural'
              ? 'Compras classificadas como naturais: sem clique operacional registrado antes da aprovação.'
              : 'Compras com clique operacional registrado antes da aprovação. Cliques de anúncios não definem esta visão.'}{' '}
          Receita, devoluções, multas e percentuais usam a mesma seleção. Devoluções pela data de
          recebimento do webhook.
        </p>
      </section>
      {renderRefundFilters({
        from,
        to,
        offerId,
        setOfferId,
        product,
        setProduct,
        provider,
        setProvider,
        vendepay,
        setVendepay,
        setPage,
        offers,
        report,
        data,
        range,
        companyId,
        setCompanyId,
        companies,
        scopedOffers,
      })}
      {companySelectionRequired ? (
        <output className={`${panel} block p-6`}>
          Selecione uma empresa para consultar seus reembolsos e chargebacks. Os dados das empresas
          não são somados automaticamente.
        </output>
      ) : report.isLoading || companies.isPending ? (
        <DataState variant="loading" title="Carregando dados financeiros…" />
      ) : !data ? (
        <DataState
          variant="error"
          title="Não foi possível carregar reembolsos"
          description="Nenhum total foi estimado."
          onRetry={() => void report.refetch()}
        />
      ) : (
        <>
          {report.isError && (
            <p role="alert" className="text-warning">
              Falha na atualização. Exibindo os últimos dados carregados.
            </p>
          )}
          <Tabs value={reportTab} onValueChange={setReportTab}>
            <TabsList aria-label="Análises dos reembolsos">
              <TabsTrigger value="period">Análise do período</TabsTrigger>
              <TabsTrigger value="month-impact">Impacto entre meses</TabsTrigger>
            </TabsList>
            <TabsContent value="month-impact">
              <RefundMonthImpact data={data.month_origin} isPrivate={isPrivate} />
            </TabsContent>
            <TabsContent value="period" className="space-y-6">
              <nav className="refund-section-nav" aria-label="Seções do relatório">
                <a href="#refund-overview">Resumo financeiro</a>
                <a href="#refund-evolution">Evolução</a>
                <a href="#refund-timing">Prazos</a>
                <a href="#refund-audit">Auditoria por pedido</a>
              </nav>
              <RefundAnalytics
                data={data}
                isPrivate={isPrivate}
                interval={interval}
                onIntervalChange={setInterval}
              />
              <section id="refund-audit" className={`${panel} refund-audit`}>
                <h2 className="text-lg font-semibold text-foreground">Auditoria das devoluções</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Pedidos únicos, com reembolsos e chargebacks unificados. Compare a data da compra
                  com a devolução; o prazo não inclui registros com datas ausentes ou
                  inconsistentes.
                </p>
                {data.totals.count > data.items.length && (
                  <p className="mt-2 text-xs text-warning">
                    Exibindo as {data.items.length} devoluções mais recentes; indicadores e gráficos
                    consideram todo o período.
                  </p>
                )}
                <p className="mt-3 text-xs text-muted-foreground">
                  Deslize a tabela para consultar todos os campos de cada pedido.
                </p>
                <section
                  className="refund-table-scroll mt-4 overflow-x-auto"
                  aria-label="Auditoria das devoluções por pedido"
                  // biome-ignore lint/a11y/noNoninteractiveTabindex: The horizontal table scroll region must be keyboard-focusable.
                  tabIndex={0}
                >
                  <table className="w-full min-w-[1100px] text-sm">
                    <caption className="sr-only">
                      Compras e devoluções por pedido, com o intervalo entre as duas datas.
                    </caption>
                    <thead>
                      <tr className="border-b border-border text-left text-xs text-muted-foreground">
                        {[
                          'Data da compra',
                          'Recebimento do webhook',
                          'Tempo decorrido',
                          'Data informada pelo gateway',
                          'Oferta / produto',
                          'Gateway / conta',
                          'Pedido',
                          'Cliente',
                          'Devolução',
                        ].map((h) => (
                          <th
                            key={h}
                            scope="col"
                            className={`whitespace-nowrap px-3 py-3 font-medium ${h === 'Devolução' ? 'text-right' : ''}`}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.items.slice((currentPage - 1) * 50, currentPage * 50).map((item) => (
                        <tr key={item.id} className="border-b border-border">
                          <td className="whitespace-nowrap px-3 py-3 text-xs tabular-nums text-foreground">
                            {formatRefundDate(item.delay_paid_at, isPrivate)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-xs tabular-nums text-foreground">
                            {formatRefundDate(item.observed_reversal_at, isPrivate)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-xs tabular-nums text-primary">
                            {formatRefundElapsed(
                              item.delay_paid_at,
                              item.observed_reversal_at,
                              isPrivate,
                            )}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-xs tabular-nums text-muted-foreground">
                            {formatRefundDate(item.delay_reversal_at, isPrivate)}
                          </td>
                          <td className="px-3 py-3">
                            <p>{item.offer_name}</p>
                            <p className="text-xs text-muted-foreground">{item.product_name}</p>
                          </td>
                          <td className="px-3 py-3">{item.connection_name}</td>
                          <td className="px-3 py-3 text-xs">
                            {isPrivate ? '****' : item.external_id}
                          </td>
                          <td className="px-3 py-3 text-xs">
                            {isPrivate ? '****' : item.buyer?.name || item.buyer?.email || '—'}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-danger">
                            {item.amount_brl_minor == null
                              ? 'Conversão pendente'
                              : refundMoney(item.brl_minor, isPrivate)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!data.items.length && <Empty />}
                </section>
                {data.items.length > 50 && (
                  <nav
                    aria-label="Paginação de devoluções"
                    className="mt-4 flex items-center justify-between gap-3"
                  >
                    <Button
                      variant="outline"
                      disabled={currentPage === 1}
                      onClick={() => setPage(currentPage - 1)}
                    >
                      Anterior
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      Página {currentPage} de {Math.ceil(data.items.length / 50)}
                    </span>
                    <Button
                      variant="outline"
                      disabled={currentPage * 50 >= data.items.length}
                      onClick={() => setPage(currentPage + 1)}
                    >
                      Próxima
                    </Button>
                  </nav>
                )}
              </section>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
