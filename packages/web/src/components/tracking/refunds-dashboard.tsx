'use client';
import { Button } from '@/components/ui/button';
import { DataState } from '@/components/ui/data-state';
import { Input } from '@/components/ui/input';
import { type TrackingPeriod, apiClient } from '@/lib/api-client';
import { selectedMonthRange } from '@/lib/date-range';
import { usePrivacy } from '@/lib/privacy-context';
import { formatRefundDate, formatRefundElapsed } from '@/lib/refund-dates';
import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { RefundAnalytics, refundMoney, refundPercent } from './refunds-visualizations';
import './refunds-dashboard.css';
const TZ = 'America/Sao_Paulo';
function today() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
function ago(days: number) {
  const [y, m, d] = today().split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! - days, 12)).toISOString().slice(0, 10);
}
const panel = 'refund-panel rounded-2xl border border-white/10 bg-bg-elevated/70 p-5 sm:p-6';
const select =
  'h-11 w-full rounded-lg border border-cyan-100/20 bg-bg-elevated px-3 text-sm text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300';
export function TrackingRefundsSummary({
  offerId,
  period,
}: {
  offerId: string;
  period?: TrackingPeriod;
}) {
  const { isPrivate } = usePrivacy();
  const from = period?.from ?? ago(29);
  const to = period?.to ?? today();
  const report = useQuery({
    queryKey: ['refunds-dashboard', 'tracking-summary', from, to, offerId],
    queryFn: () => apiClient.getRefundsDashboard(from, to, offerId),
    retry: false,
  });
  if (report.isLoading)
    return <DataState variant="loading" title="Carregando resumo de devoluções…" />;
  if (!report.data || report.isError)
    return (
      <DataState
        variant="error"
        title="Não foi possível carregar o resumo financeiro"
        onRetry={() => void report.refetch()}
      />
    );
  const t = report.data.totals;
  return (
    <section className={panel}>
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h2 className="font-semibold text-white">Reembolsos e chargebacks</h2>
          <p className="mt-1 text-xs text-white/50">
            {from} a {to} · valores em BRL
          </p>
        </div>
        <Button asChild variant="outline">
          <a href={`/reembolsos?offer_id=${encodeURIComponent(offerId)}`}>
            Abrir relatório completo
          </a>
        </Button>
      </div>
      <dl className="mt-5 grid gap-5 sm:grid-cols-3">
        <Metric
          label="Reembolsos e chargebacks"
          value={refundMoney(t.brl_minor, isPrivate)}
          detail={`${t.count} devoluções · ${refundPercent(t.rate_pct, isPrivate)} do faturamento`}
        />
        <Metric
          label="Multas"
          value={refundMoney(t.fee_brl_minor, isPrivate)}
          detail="Conforme configuração de cada gateway"
        />
        <Metric
          label="Impacto total"
          value={refundMoney(t.impact_brl_minor, isPrivate)}
          detail={`${refundPercent(t.impact_pct, isPrivate)} do faturamento, incluindo multas`}
        />
      </dl>
      {(t.missing_brl_orders > 0 || t.missing_fee_orders > 0) && (
        <p className="mt-3 text-sm text-amber-200">
          Total parcial: há conversões ou multas pendentes de configuração.
        </p>
      )}
    </section>
  );
}
export function RefundsDashboard({
  initialOfferId = '',
}: {
  initialOfferId?: string;
}) {
  const workspace = useRef<HTMLDivElement>(null);
  const [from, setFrom] = useState(() => ago(29));
  const [to, setTo] = useState(today);
  const [offerId, setOfferId] = useState(initialOfferId);
  const [product, setProduct] = useState('');
  const [provider, setProvider] = useState('');
  const [vendepay, setVendepay] = useState<'' | 'mainex' | 'cobrak'>('');
  const [interval, setInterval] = useState<'day' | 'week' | 'month'>('day');
  const [page, setPage] = useState(1);
  const { isPrivate } = usePrivacy();
  const offers = useQuery({
    queryKey: ['offers'],
    queryFn: apiClient.listOffers,
    retry: false,
  });
  const report = useQuery({
    queryKey: ['refunds-dashboard', from, to, offerId, product, vendepay, provider, interval],
    queryFn: () =>
      apiClient.getRefundsDashboard(
        from,
        to,
        offerId || undefined,
        product || undefined,
        vendepay || undefined,
        { interval, provider: provider || undefined },
      ),
    retry: false,
  });
  const data = report.data;
  useEffect(() => {
    const root = workspace.current;
    if (!root || !('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const panels = root.querySelectorAll<HTMLElement>('.refund-panel');
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          (entry.target as HTMLElement).dataset.reveal = 'visible';
          observer.unobserve(entry.target);
        }
      }
    }, { threshold: 0, rootMargin: '0px 0px -24px 0px' });
    for (const panel of panels) {
      if (panel.dataset.reveal === 'visible') continue;
      panel.dataset.reveal = 'pending';
      observer.observe(panel);
    }
    return () => {
      observer.disconnect();
      for (const panel of panels) panel.dataset.reveal = 'visible';
    };
  }, [Boolean(data)]);
  const range = (a: string, b: string) => {
    setFrom(a);
    setTo(b);
    setPage(1);
  };
  const currentPage = Math.min(page, Math.max(1, Math.ceil((data?.items.length ?? 0) / 50)));
  return (
    <div ref={workspace} className="refund-workspace space-y-6">
      <header className="refund-header">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Reembolsos e chargebacks</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">Acompanhe o impacto financeiro, a evolução das devoluções e o prazo desde a compra.</p>
        </div>
        <div className="refund-context"><span className="refund-context-dot" aria-hidden="true" /> BRL · São Paulo</div>
      </header>
      <nav className="refund-section-nav" aria-label="Seções do relatório">
        <a href="#refund-overview">Resumo financeiro</a>
        <a href="#refund-evolution">Evolução</a>
        <a href="#refund-timing">Prazos</a>
        <a href="#refund-audit">Auditoria por pedido</a>
      </nav>
      <section className={`${panel} refund-filters`} aria-label="Filtros do relatório">
        <div className="flex flex-wrap justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-white">Período e filtros</h2>
            <p className="mt-1 text-xs text-slate-400">Reembolsos e chargebacks sempre unificados.</p>
          </div>
          <span className="refund-scope">{offerId ? offers.data?.find((o) => o.id === offerId)?.name || 'Oferta selecionada' : 'Minhas ofertas · empresa TMX'}</span>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {[
            ['Hoje', today(), today()],
            ['Ontem', ago(1), ago(1)],
            ['Últimos 7 dias', ago(6), today()],
            ['Este mês', `${today().slice(0, 7)}-01`, today()],
          ].map(([label, a, b]) => (
            <Button key={label} size="sm" aria-pressed={a === from && b === to}
              variant={a === from && b === to ? 'default' : 'outline'} onClick={() => range(a!, b!)}>
              {label}
            </Button>
          ))}
          <Button size="sm" variant="outline" className="sm:ml-auto" disabled={report.isFetching} onClick={() => void report.refetch()}>
            {report.isFetching ? 'Atualizando…' : 'Atualizar dados'}
          </Button>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <Field label="Selecionar mês">
            <Input
              aria-label="Selecionar mês"
              type="month"
              max={today().slice(0, 7)}
              value={
                from.endsWith('-01') && selectedMonthRange(from.slice(0, 7))?.to === to
                  ? from.slice(0, 7)
                  : ''
              }
              onChange={(e) => {
                const r = selectedMonthRange(e.target.value);
                if (r) range(r.from, r.to);
              }}
            />
          </Field>
          <Field label="De">
            <Input
              aria-label="De"
              type="date"
              value={from}
              max={to}
              onChange={(e) => range(e.target.value, to)}
            />
          </Field>
          <Field label="Até">
            <Input
              aria-label="Até"
              type="date"
              value={to}
              min={from}
              max={today()}
              onChange={(e) => range(from, e.target.value)}
            />
          </Field>
        </div>
        <div className="mt-5 grid gap-3 border-t border-white/10 pt-5 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Oferta">
            <select
              aria-label="Oferta"
              className={select}
              value={offerId}
              onChange={(e) => {
                setOfferId(e.target.value);
                setProduct('');
                setPage(1);
              }}
            >
              <option value="">Minhas ofertas da empresa TMX</option>
              {offers.data?.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Gateway">
            <select
              aria-label="Gateway"
              className={select}
              value={provider}
              onChange={(e) => {
                setProvider(e.target.value);
                setVendepay('');
                setProduct('');
                setPage(1);
              }}
            >
              <option value="">Todos os gateways</option>
              {[
                ...new Set([
                  'vendepay',
                  'syzepay',
                  'paysight',
                  'explodely',
                  ...(data?.providers ?? []),
                ]),
              ].map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Conta VendePay">
            <select
              aria-label="Conta VendePay"
              className={select}
              value={vendepay}
              disabled={Boolean(provider && provider !== 'vendepay')}
              onChange={(e) => {
                setVendepay(e.target.value as typeof vendepay);
                setProduct('');
                setPage(1);
              }}
            >
              <option value="">Todas as contas</option>
              <option value="mainex">VendePay Mainex</option>
              <option value="cobrak">VendePay Cobrak</option>
            </select>
          </Field>
          <Field label="Produto">
            <select
              aria-label="Produto"
              className={select}
              value={product}
              onChange={(e) => {
                setProduct(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Todos os produtos</option>
              {data?.products.map((p) => (
                <option key={p.product_name} value={p.product_name}>
                  {p.product_name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {!offerId && (
          <p className="mt-3 text-sm text-white/60">
            Receita, devoluções e multas somente das ofertas criadas pelo seu perfil
            e vinculadas à empresa TMX. Outras empresas e outros membros não entram neste consolidado.
          </p>
        )}
        {offers.isError && (
          <p role="alert" className="mt-3 text-sm text-amber-200">
            Não foi possível carregar as ofertas.{' '}
            <button type="button" className="underline" onClick={() => void offers.refetch()}>
              Tentar novamente
            </button>
          </p>
        )}
      </section>
      {report.isLoading ? (
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
            <p role="alert" className="text-amber-200">
              Falha na atualização. Exibindo os últimos dados carregados.
            </p>
          )}
          <RefundAnalytics
            data={data}
            isPrivate={isPrivate}
            interval={interval}
            onIntervalChange={setInterval}
          />
          <section id="refund-audit" className={`${panel} refund-audit`}>
            <h2 className="text-lg font-semibold text-white">Auditoria das devoluções</h2>
            <p className="mt-1 text-xs text-white/50">
              Pedidos únicos, com reembolsos e chargebacks unificados. Compare a data da compra
              com a devolução; o prazo não inclui registros com datas ausentes ou inconsistentes.
            </p>
            {data.totals.count > data.items.length && (
              <p className="mt-2 text-xs text-amber-200">
                Exibindo as {data.items.length} devoluções mais recentes; indicadores e gráficos
                consideram todo o período.
              </p>
            )}
            <p className="mt-3 text-xs text-slate-400">Deslize a tabela para consultar todos os campos de cada pedido.</p>
            <div className="refund-table-scroll mt-4 overflow-x-auto" role="region" aria-label="Auditoria das devoluções por pedido" tabIndex={0}>
              <table className="w-full min-w-[1100px] text-sm">
                <caption className="sr-only">
                  Compras e devoluções por pedido, com o intervalo entre as duas datas.
                </caption>
                <thead>
                  <tr className="border-b border-white/10 text-left text-xs text-white/50">
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
                      <th key={h} scope="col" className={`whitespace-nowrap px-3 py-3 font-medium ${h === 'Devolução' ? 'text-right' : ''}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.items.slice((currentPage - 1) * 50, currentPage * 50).map((item) => (
                    <tr key={item.id} className="border-b border-white/5">
                      <td className="whitespace-nowrap px-3 py-3 text-xs tabular-nums text-white/80">
                        {formatRefundDate(item.delay_paid_at, isPrivate)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-xs tabular-nums text-white/80">
                        {formatRefundDate(item.observed_reversal_at, isPrivate)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-xs tabular-nums text-cyan-200">
                        {formatRefundElapsed(item.delay_paid_at, item.observed_reversal_at, isPrivate)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-xs tabular-nums text-white/70">
                        {formatRefundDate(item.delay_reversal_at, isPrivate)}
                      </td>
                      <td className="px-3 py-3">
                        <p>{item.offer_name}</p>
                        <p className="text-xs text-white/50">{item.product_name}</p>
                      </td>
                      <td className="px-3 py-3">{item.connection_name}</td>
                      <td className="px-3 py-3 text-xs">{isPrivate ? '****' : item.external_id}</td>
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
            </div>
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
                <span className="text-xs text-white/50">
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
        </>
      )}
    </div>
  );
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block min-w-0 space-y-2 text-xs text-slate-300">
      <span>{label}</span>
      {children}
    </label>
  );
}
function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div>
      <dt className="text-sm text-white/60">{label}</dt>
      <dd className="mt-2 text-2xl font-semibold tabular-nums text-white">{value}</dd>
      <p className="mt-1 text-xs leading-5 text-white/50">{detail}</p>
    </div>
  );
}
function Empty() {
  return (
    <p className="py-8 text-center text-sm text-white/50">Nenhum dado disponível neste filtro.</p>
  );
}
