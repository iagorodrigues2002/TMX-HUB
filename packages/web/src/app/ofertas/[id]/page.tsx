'use client';

import {
  KpiGrid,
  formatBRL,
  formatInt,
  formatPercent,
  formatRoas,
} from '@/components/dashboard/kpi-cards';
import { HubShell } from '@/components/hub/hub-shell';
import { OfferCard } from '@/components/ofertas/offer-card';
import { OfferEditDialog } from '@/components/ofertas/offer-edit-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiClient, type MetricsView } from '@/lib/api-client';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ChevronDown, Clock3, Loader2, Pencil, Search, Target } from 'lucide-react';
import Link from 'next/link';
import { use, useMemo, useState } from 'react';

export const dynamic = 'force-dynamic';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function nDaysAgoIso(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

const PRESETS = [
  { label: 'Hoje', from: () => todayIso(), to: () => todayIso() },
  { label: '7d', from: () => nDaysAgoIso(6), to: () => todayIso() },
  { label: '14d', from: () => nDaysAgoIso(13), to: () => todayIso() },
  { label: '30d', from: () => nDaysAgoIso(29), to: () => todayIso() },
];

function WindowMetrics({ metrics }: { metrics: MetricsView }) {
  return (
    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
      <div>
        <dt className="hud-label">Investido</dt>
        <dd className="mt-1 font-mono text-[15px] text-amber-300">{formatBRL(metrics.spend)}</dd>
      </div>
      <div>
        <dt className="hud-label">Vendas</dt>
        <dd className="mt-1 font-mono text-[15px] text-emerald-300">{formatInt(metrics.sales)}</dd>
      </div>
      <div>
        <dt className="hud-label">CPA</dt>
        <dd className="mt-1 font-mono text-[15px] text-white/85">{formatBRL(metrics.cpa)}</dd>
      </div>
      <div>
        <dt className="hud-label">IC</dt>
        <dd className="mt-1 font-mono text-[15px] text-cyan-300">{formatInt(metrics.ic)}</dd>
      </div>
      <div>
        <dt className="hud-label">Faturamento</dt>
        <dd className="mt-1 font-mono text-[15px] text-emerald-300">{formatBRL(metrics.revenue)}</dd>
      </div>
      <div>
        <dt className="hud-label">CPA IC</dt>
        <dd className="mt-1 font-mono text-[15px] text-white/85">{formatBRL(metrics.icCpa)}</dd>
      </div>
      <div>
        <dt className="hud-label">Conv. IC</dt>
        <dd className="mt-1 font-mono text-[15px] text-white/85">
          {formatPercent(metrics.conversionRate)}
        </dd>
      </div>
      <div>
        <dt className="hud-label">ROAS</dt>
        <dd className="mt-1 font-mono text-[15px] text-cyan-300">{formatRoas(metrics.roas)}</dd>
      </div>
    </dl>
  );
}

export default function OfertaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [from, setFrom] = useState(() => nDaysAgoIso(6));
  const [to, setTo] = useState(() => todayIso());
  const [editing, setEditing] = useState(false);
  const [adSearch, setAdSearch] = useState('');
  const [compareLeft, setCompareLeft] = useState('');
  const [compareRight, setCompareRight] = useState('');

  // Pull the offer (with links/status) from the offers list cache when possible.
  const offerQuery = useQuery({
    queryKey: ['offer-detail', id],
    queryFn: async () => {
      const all = await apiClient.listOffers();
      return all.find((o) => o.id === id) ?? null;
    },
  });
  const offer = offerQuery.data;

  const capabilitiesQuery = useQuery({
    queryKey: ['utmify-capabilities', id],
    queryFn: () => apiClient.getUtmifyCapabilities(id),
    enabled: Boolean(offer?.utmifyConfigured),
    staleTime: 30 * 60 * 1000,
    retry: false,
  });

  const snapshotsQuery = useQuery({
    queryKey: ['offer-snapshots', id, from, to],
    queryFn: () => apiClient.getOfferSnapshots(id, { from, to }),
    refetchOnWindowFocus: false,
  });
  const data = snapshotsQuery.data;

  const intradayQuery = useQuery({
    queryKey: ['offer-intraday', id],
    queryFn: () => apiClient.getOfferIntraday(id),
    enabled: Boolean(offer?.utmifyConfigured),
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
  });
  const intraday = intradayQuery.data;

  const adsetTotals = useMemo(() => {
    if (!data)
      return [] as Array<{
        name: string;
        spend: number;
        sales: number;
        revenue: number;
        ic: number;
      }>;
    const map = new Map<
      string,
      { name: string; spend: number; sales: number; revenue: number; ic: number }
    >();
    for (const snap of data.snapshots) {
      for (const a of snap.adsets ?? []) {
        const existing = map.get(a.name);
        if (existing) {
          existing.spend += a.spend;
          existing.sales += a.sales;
          existing.revenue += a.revenue;
          existing.ic += a.ic;
        } else {
          map.set(a.name, {
            name: a.name,
            spend: a.spend,
            sales: a.sales,
            revenue: a.revenue,
            ic: a.ic,
          });
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }, [data]);

  const adTotals = useMemo(() => {
    const map = new Map<
      string,
      {
        name: string;
        spend: number;
        sales: number;
        revenue: number;
        ic: number;
        impressions: number;
        clicks: number;
      }
    >();
    for (const snapshot of data?.snapshots ?? []) {
      for (const ad of snapshot.ads ?? []) {
        const current = map.get(ad.name) ?? {
          name: ad.name,
          spend: 0,
          sales: 0,
          revenue: 0,
          ic: 0,
          impressions: 0,
          clicks: 0,
        };
        current.spend += ad.spend;
        current.sales += ad.sales;
        current.revenue += ad.revenue;
        current.ic += ad.ic;
        current.impressions += ad.impressions ?? 0;
        current.clicks += ad.clicks ?? 0;
        map.set(ad.name, current);
      }
    }
    const query = adSearch.trim().toLocaleLowerCase('pt-BR');
    return [...map.values()]
      .filter((ad) => !query || ad.name.toLocaleLowerCase('pt-BR').includes(query))
      .sort((a, b) => b.revenue - a.revenue);
  }, [data, adSearch]);

  const offerName = offer?.name ?? data?.offer.name ?? id.slice(-6).toUpperCase();
  const availableWindows = intraday?.windows.filter((window) => window.available) ?? [];
  const defaultLeft = availableWindows.at(-2)?.index ?? availableWindows.at(-1)?.index;
  const defaultRight = availableWindows.at(-1)?.index;
  const leftWindow = intraday?.windows.find(
    (window) => window.index === (compareLeft ? Number(compareLeft) : defaultLeft),
  );
  const rightWindow = intraday?.windows.find(
    (window) => window.index === (compareRight ? Number(compareRight) : defaultRight),
  );
  const currentWindow = intraday?.windows.find(
    (window) => window.index === intraday.currentWindowIndex,
  );

  return (
    <HubShell breadcrumb={['OFERTAS', offerName]}>
      <div className="mb-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/ofertas" className="gap-1">
            <ArrowLeft className="h-4 w-4" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em]">
              Todas as ofertas
            </span>
          </Link>
        </Button>
      </div>

      <header className="mb-6 flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-cyan-300" />
            <p className="hud-label">Oferta</p>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white">{offerName}</h1>
          {offer?.dashboardId && (
            <p className="font-mono text-[11px] text-white/40">
              utmify dashboardId: {offer.dashboardId}
            </p>
          )}
        </div>
        {offer && (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5" />
            Editar oferta
          </Button>
        )}
      </header>

      {/* Identidade + links da oferta (mesmo card da listagem, em destaque) */}
      {offer && (
        <section className="mb-6">
          <OfferCard offer={offer} onEdit={() => setEditing(true)} onDelete={() => undefined} />
        </section>
      )}

      {offer?.utmifyConfigured && (
        <details className="glass-card group mb-6 overflow-hidden p-0">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 [&::-webkit-details-marker]:hidden">
            <div>
              <p className="hud-label">Conta de anúncios via UTMify</p>
              <p className="mt-1 text-[12px] text-white/55">
                {capabilitiesQuery.data?.accountFields.length ?? 0} conta(s) identificada(s) · clique para abrir
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
                  <p className="mb-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-cyan-300/70">
                    Conta {index + 1}
                  </p>
                  <div className="space-y-2">
                    {Object.entries(account).map(([key, value]) => (
                      <div key={key}>
                        <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/35">
                          {key === 'accountId'
                            ? 'ID da conta'
                            : key === 'accountStatus'
                              ? 'Status da conta'
                              : key}
                        </p>
                        <p className="mt-1 truncate font-mono text-[12px] text-white/80">
                          {String(value)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : capabilitiesQuery.isSuccess ? (
            <p className="mt-3 text-[12px] text-amber-200/75">
              O endpoint de anúncios não retornou nome nem status da conta neste período.
            </p>
          ) : capabilitiesQuery.isError ? (
            <p className="mt-3 text-[12px] text-rose-200/75">
              Não foi possível inspecionar os campos da conta agora.
            </p>
          ) : null}
          </div>
        </details>
      )}

      <h2 className="mb-3 text-[16px] font-semibold text-white">Métricas</h2>

      {/* Filter */}
      <div className="glass-card mb-4 flex flex-wrap items-end gap-3 p-4">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => {
            const active = from === p.from() && to === p.to();
            return (
              <Button
                key={p.label}
                size="sm"
                variant={active ? 'default' : 'outline'}
                onClick={() => {
                  setFrom(p.from());
                  setTo(p.to());
                }}
              >
                {p.label}
              </Button>
            );
          })}
        </div>
        <div className="ml-auto flex items-end gap-2">
          <div className="space-y-1">
            <Label className="hud-label">De</Label>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-9 w-[150px]"
            />
          </div>
          <div className="space-y-1">
            <Label className="hud-label">Até</Label>
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-9 w-[150px]"
            />
          </div>
          {snapshotsQuery.isFetching && (
            <Loader2 className="mb-2 h-4 w-4 animate-spin text-cyan-300" />
          )}
        </div>
      </div>

      {snapshotsQuery.isLoading ? (
        <div className="glass-card flex items-center justify-center p-12">
          <Loader2 className="h-5 w-5 animate-spin text-cyan-300" />
        </div>
      ) : !data ? (
        <p className="text-[13px] text-white/45">Sem dados.</p>
      ) : (
        <div className="space-y-6">
          <KpiGrid metrics={data.totals} />

          <section className="glass-card overflow-hidden p-0">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
              <div>
                <h3 className="text-[14px] font-semibold text-white">Anúncios</h3>
                <p className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-white/40">
                  Dados UTMify em nível de ad
                </p>
              </div>
              <div className="relative w-full sm:w-[280px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/35" />
                <Input
                  value={adSearch}
                  onChange={(event) => setAdSearch(event.target.value)}
                  placeholder="Buscar anúncio pelo nome…"
                  className="h-9 pl-9"
                />
              </div>
            </header>
            {adTotals.length === 0 ? (
              <div className="p-8 text-center text-[13px] text-white/45">
                {adSearch
                  ? 'Nenhum anúncio corresponde à busca.'
                  : 'Os anúncios aparecerão após a primeira sincronização UTMify.'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead className="bg-white/[0.03] text-left text-[10px] font-semibold uppercase tracking-[0.16em] text-white/55">
                    <tr>
                      <th className="px-3 py-2">Anúncio</th>
                      <th className="px-3 py-2 text-right">Investido</th>
                      <th className="px-3 py-2 text-right">Faturamento</th>
                      <th className="px-3 py-2 text-right">Vendas</th>
                      <th className="px-3 py-2 text-right">CPA</th>
                      <th className="px-3 py-2 text-right">ROAS</th>
                      <th className="px-3 py-2 text-right">CTR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adTotals.map((ad) => {
                      const cpa = ad.sales > 0 ? ad.spend / ad.sales : null;
                      const roas = ad.spend > 0 ? ad.revenue / ad.spend : null;
                      const ctr = ad.impressions > 0 ? ad.clicks / ad.impressions : null;
                      return (
                        <tr key={ad.name} className="border-t border-white/[0.04]">
                          <td className="max-w-[420px] px-3 py-2 text-white/85" title={ad.name}>
                            {ad.name}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-amber-300">
                            {formatBRL(ad.spend)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-emerald-300">
                            {formatBRL(ad.revenue)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-white/75">
                            {formatInt(ad.sales)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-white/75">
                            {formatBRL(cpa)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-cyan-300">
                            {formatRoas(roas)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-white/75">
                            {formatPercent(ctr)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="glass-card overflow-hidden p-0">
            <header className="flex items-baseline justify-between border-b border-white/[0.06] px-4 py-3">
              <h3 className="text-[14px] font-semibold text-white">Série diária</h3>
              <span className="hud-label">{data.snapshots.length} dia(s)</span>
            </header>
            {data.snapshots.length === 0 ? (
              <div className="p-8 text-center text-[13px] text-white/45">
                Nenhum dado sincronizado nesse período. Verifique a conexão UTMify da oferta.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead className="bg-white/[0.03] text-left text-[10px] font-semibold uppercase tracking-[0.16em] text-white/55">
                    <tr>
                      <th className="px-3 py-2">Data</th>
                      <th className="px-3 py-2 text-right">Vendas</th>
                      <th className="px-3 py-2 text-right">Faturamento</th>
                      <th className="px-3 py-2 text-right">Investido</th>
                      <th className="px-3 py-2 text-right">IC</th>
                      <th className="px-3 py-2 text-right">CPA</th>
                      <th className="px-3 py-2 text-right">CPA IC</th>
                      <th className="px-3 py-2 text-right">Conv.</th>
                      <th className="px-3 py-2 text-right">ROAS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.snapshots.map((s) => (
                      <tr key={s.date} className="border-t border-white/[0.04]">
                        <td className="px-3 py-2 font-mono text-white/85">{s.date}</td>
                        <td className="px-3 py-2 text-right font-mono text-emerald-300">
                          {formatInt(s.sales)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-emerald-300">
                          {formatBRL(s.revenue)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-amber-300">
                          {formatBRL(s.spend)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-white/75">
                          {formatInt(s.ic)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-white/75">
                          {formatBRL(s.metrics.cpa)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-white/75">
                          {formatBRL(s.metrics.icCpa)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-white/75">
                          {formatPercent(s.metrics.conversionRate)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-cyan-300">
                          {formatRoas(s.metrics.roas)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {adsetTotals.length > 0 && (
            <section className="glass-card overflow-hidden p-0">
              <header className="flex items-baseline justify-between border-b border-white/[0.06] px-4 py-3">
                <h3 className="text-[14px] font-semibold text-white">Adsets</h3>
                <span className="hud-label">
                  {adsetTotals.length} no período · ranqueado por faturamento
                </span>
              </header>
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead className="bg-white/[0.03] text-left text-[10px] font-semibold uppercase tracking-[0.16em] text-white/55">
                    <tr>
                      <th className="px-3 py-2">Adset</th>
                      <th className="px-3 py-2 text-right">Vendas</th>
                      <th className="px-3 py-2 text-right">Faturamento</th>
                      <th className="px-3 py-2 text-right">Investido</th>
                      <th className="px-3 py-2 text-right">IC</th>
                      <th className="px-3 py-2 text-right">CPA</th>
                      <th className="px-3 py-2 text-right">ROAS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adsetTotals.map((a) => {
                      const cpa = a.sales > 0 ? a.spend / a.sales : null;
                      const roas = a.spend > 0 ? a.revenue / a.spend : null;
                      return (
                        <tr key={a.name} className="border-t border-white/[0.04]">
                          <td className="max-w-[280px] truncate px-3 py-2 text-white/85">
                            {a.name}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-emerald-300">
                            {formatInt(a.sales)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-emerald-300">
                            {formatBRL(a.revenue)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-amber-300">
                            {formatBRL(a.spend)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-white/75">
                            {formatInt(a.ic)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-white/75">
                            {formatBRL(cpa)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-cyan-300">
                            {formatRoas(roas)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      )}

      <section className="mt-8 space-y-4 border-t border-cyan-300/10 pt-8">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-cyan-300" />
              <h2 className="text-[16px] font-semibold text-white">Janelas intradiárias</h2>
            </div>
            <p className="mt-1 text-[12px] text-white/45">
              Checkpoints a cada 30 minutos · janelas fixas de 2 horas · somente de hoje em diante
            </p>
          </div>
          {intraday?.updatedAt && (
            <span className="hud-label">
              Atualizado {new Date(intraday.updatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </header>

        {intradayQuery.isLoading ? (
          <div className="glass-card flex items-center justify-center p-10">
            <Loader2 className="h-5 w-5 animate-spin text-cyan-300" />
          </div>
        ) : !intraday ? (
          <div className="glass-card p-6 text-[13px] text-white/45">
            A coleta intradiária começará na próxima sincronização UTMify.
          </div>
        ) : (
          <>
            <div className="grid gap-4 xl:grid-cols-2">
              <article className="glass-card p-4">
                <p className="hud-label">Janela geral de hoje</p>
                <p className="mt-1 text-[12px] text-white/45">Acumulado desde 00h</p>
                <WindowMetrics metrics={intraday.overall} />
              </article>
              <article className="glass-card border-cyan-300/15 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="hud-label">Janela atual</p>
                    <p className="mt-1 text-[12px] text-white/45">
                      {currentWindow?.label ?? 'Aguardando checkpoint'}
                    </p>
                  </div>
                  {currentWindow?.partial && (
                    <span className="rounded-full border border-amber-300/20 px-2 py-1 text-[9px] uppercase tracking-[0.12em] text-amber-200">
                      Parcial
                    </span>
                  )}
                </div>
                {currentWindow?.available ? (
                  <WindowMetrics metrics={currentWindow.metrics} />
                ) : (
                  <p className="mt-5 text-[12px] text-white/45">
                    É necessário um checkpoint anterior ao início da janela para calcular a diferença.
                  </p>
                )}
              </article>
            </div>

            <div className="glass-card overflow-hidden p-0">
              <header className="border-b border-white/[0.06] px-4 py-3">
                <h3 className="text-[14px] font-semibold text-white">Janelas de 2 horas</h3>
                <p className="mt-1 text-[11px] text-white/40">
                  Cada valor representa somente o que aconteceu dentro daquela faixa.
                </p>
              </header>
              <div className="grid gap-px bg-white/[0.04] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {intraday.windows.map((window) => (
                  <article key={window.index} className="bg-[#07151b] p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-mono text-[13px] font-semibold text-white/85">{window.label}</p>
                      <span className="text-[9px] uppercase tracking-[0.12em] text-white/30">
                        {window.samples} coleta(s)
                      </span>
                    </div>
                    {window.available ? (
                      <dl className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                        <div><dt className="text-white/35">Investido</dt><dd className="font-mono text-amber-300">{formatBRL(window.metrics.spend)}</dd></div>
                        <div><dt className="text-white/35">Vendas</dt><dd className="font-mono text-emerald-300">{formatInt(window.metrics.sales)}</dd></div>
                        <div><dt className="text-white/35">CPA</dt><dd className="font-mono text-white/75">{formatBRL(window.metrics.cpa)}</dd></div>
                        <div><dt className="text-white/35">IC</dt><dd className="font-mono text-cyan-300">{formatInt(window.metrics.ic)}</dd></div>
                        <div><dt className="text-white/35">CPA IC</dt><dd className="font-mono text-white/75">{formatBRL(window.metrics.icCpa)}</dd></div>
                        <div><dt className="text-white/35">ROAS</dt><dd className="font-mono text-cyan-300">{formatRoas(window.metrics.roas)}</dd></div>
                      </dl>
                    ) : (
                      <p className="mt-3 text-[11px] text-white/30">
                        {window.partial ? 'Coleta iniciada no meio desta janela.' : 'Sem dados coletados.'}
                      </p>
                    )}
                  </article>
                ))}
              </div>
            </div>

            <div className="glass-card p-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="mr-auto">
                  <h3 className="text-[14px] font-semibold text-white">Comparar janelas</h3>
                  <p className="mt-1 text-[11px] text-white/40">Selecione duas faixas já calculadas.</p>
                </div>
                <Label className="space-y-1">
                  <span className="hud-label">Janela A</span>
                  <select value={compareLeft} onChange={(event) => setCompareLeft(event.target.value)} className="block h-9 rounded-md border border-white/10 bg-[#0b1b22] px-3 text-[12px] text-white">
                    <option value="">Anterior disponível</option>
                    {availableWindows.map((window) => <option key={window.index} value={window.index}>{window.label}</option>)}
                  </select>
                </Label>
                <Label className="space-y-1">
                  <span className="hud-label">Janela B</span>
                  <select value={compareRight} onChange={(event) => setCompareRight(event.target.value)} className="block h-9 rounded-md border border-white/10 bg-[#0b1b22] px-3 text-[12px] text-white">
                    <option value="">Mais recente disponível</option>
                    {availableWindows.map((window) => <option key={window.index} value={window.index}>{window.label}</option>)}
                  </select>
                </Label>
              </div>
              {leftWindow?.available && rightWindow?.available ? (
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  {[leftWindow, rightWindow].map((window) => (
                    <article key={window.index} className="rounded-xl border border-white/[0.06] bg-black/10 p-4">
                      <p className="font-mono text-[13px] font-semibold text-cyan-200">{window.label}</p>
                      <WindowMetrics metrics={window.metrics} />
                    </article>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-[12px] text-white/40">
                  A comparação ficará disponível após duas janelas completas.
                </p>
              )}
            </div>
          </>
        )}
      </section>

      {offer && <OfferEditDialog offer={offer} open={editing} onOpenChange={setEditing} />}
    </HubShell>
  );
}
