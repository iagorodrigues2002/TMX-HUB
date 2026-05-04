'use client';

import Link from 'next/link';
import { use, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, LayoutDashboard, Loader2 } from 'lucide-react';
import { HubShell } from '@/components/hub/hub-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiClient } from '@/lib/api-client';
import {
  KpiGrid,
  formatBRL,
  formatInt,
  formatPercent,
  formatRoas,
} from '@/components/dashboard/kpi-cards';

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

export default function DashboardDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [from, setFrom] = useState(() => nDaysAgoIso(6));
  const [to, setTo] = useState(() => todayIso());

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['offer-snapshots', id, from, to],
    queryFn: () => apiClient.getOfferSnapshots(id, { from, to }),
    refetchOnWindowFocus: false,
  });

  // Aggregate adsets across the selected range so we can rank them in a table.
  const adsetTotals = useMemo(() => {
    if (!data) return [] as Array<{ name: string; spend: number; sales: number; revenue: number; ic: number }>;
    const map = new Map<string, { name: string; spend: number; sales: number; revenue: number; ic: number }>();
    for (const snap of data.snapshots) {
      for (const a of snap.adsets ?? []) {
        const existing = map.get(a.name);
        if (existing) {
          existing.spend += a.spend;
          existing.sales += a.sales;
          existing.revenue += a.revenue;
          existing.ic += a.ic;
        } else {
          map.set(a.name, { name: a.name, spend: a.spend, sales: a.sales, revenue: a.revenue, ic: a.ic });
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }, [data]);

  return (
    <HubShell breadcrumb={['DASHBOARDS', data?.offer.name ?? id.slice(-6).toUpperCase()]}>
      <div className="mb-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/dashboards" className="gap-1">
            <ArrowLeft className="h-4 w-4" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em]">
              Todas as dashboards
            </span>
          </Link>
        </Button>
      </div>

      <header className="mb-6 space-y-2">
        <div className="flex items-center gap-2">
          <LayoutDashboard className="h-5 w-5 text-cyan-300" />
          <p className="hud-label">Sub-dashboard</p>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-white">
          {data?.offer.name ?? '...'}
        </h1>
        {data?.offer.dashboardId && (
          <p className="font-mono text-[11px] text-white/40">
            utmify dashboardId: {data.offer.dashboardId}
          </p>
        )}
      </header>

      {/* Filter */}
      <div className="glass-card mb-6 flex flex-wrap items-end gap-3 p-4">
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
          {isFetching && <Loader2 className="mb-2 h-4 w-4 animate-spin text-cyan-300" />}
        </div>
      </div>

      {isLoading ? (
        <div className="glass-card flex items-center justify-center p-12">
          <Loader2 className="h-5 w-5 animate-spin text-cyan-300" />
        </div>
      ) : !data ? (
        <p className="text-[13px] text-white/45">Sem dados.</p>
      ) : (
        <div className="space-y-6">
          <KpiGrid metrics={data.totals} />

          {/* Daily series */}
          <section className="glass-card overflow-hidden p-0">
            <header className="flex items-baseline justify-between border-b border-white/[0.06] px-4 py-3">
              <h2 className="text-[14px] font-semibold text-white">Série diária</h2>
              <span className="hud-label">{data.snapshots.length} dia(s)</span>
            </header>
            {data.snapshots.length === 0 ? (
              <div className="p-8 text-center text-[13px] text-white/45">
                Nenhum snapshot ingerido nesse período. Configure o n8n adapter pra começar.
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

          {/* Adsets table (only if any snapshot brought adset data) */}
          {adsetTotals.length > 0 && (
            <section className="glass-card overflow-hidden p-0">
              <header className="flex items-baseline justify-between border-b border-white/[0.06] px-4 py-3">
                <h2 className="text-[14px] font-semibold text-white">Adsets</h2>
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
    </HubShell>
  );
}
