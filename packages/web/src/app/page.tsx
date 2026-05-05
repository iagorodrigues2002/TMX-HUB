'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  BarChart3,
  GitCompare,
  Layers,
  Loader2,
  Network,
  Plus,
  ScrollText,
  Video,
  Webhook,
} from 'lucide-react';
import { HubShell } from '@/components/hub/hub-shell';
import { ToolCard } from '@/components/hub/tool-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/lib/auth-context';
import { apiClient } from '@/lib/api-client';
import {
  KpiGrid,
  formatBRL,
  formatInt,
  formatRoas,
} from '@/components/dashboard/kpi-cards';

export const dynamic = 'force-dynamic';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function nDaysAgoIso(n: number) {
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

export default function HubLandingPage() {
  const { user } = useAuth();
  const [from, setFrom] = useState(() => nDaysAgoIso(6));
  const [to, setTo] = useState(() => todayIso());

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['dashboard-summary', from, to],
    queryFn: () => apiClient.getDashboardSummary({ from, to }),
    enabled: Boolean(user),
    refetchOnWindowFocus: false,
  });

  const firstName = user?.name?.split(/\s+/)[0] ?? 'Operador';

  return (
    <HubShell>
      <header className="space-y-3">
        <p className="hud-label">Operator Console</p>
        <h1 className="text-3xl font-bold leading-tight tracking-tight text-white md:text-4xl">
          Olá,{' '}
          <span
            className="bg-clip-text text-transparent"
            style={{ backgroundImage: 'linear-gradient(90deg, #0E7C86 0%, #22D3EE 100%)' }}
          >
            {firstName}
          </span>
        </h1>
        <p className="max-w-xl text-[14px] text-white/55">
          Visão geral cruzando todas as suas dashboards. Use os filtros pra mudar o período.
        </p>
      </header>

      {/* Filter bar */}
      <section className="mt-8">
        <div className="glass-card flex flex-wrap items-end gap-3 p-4">
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
          </div>
        </div>
      </section>

      {/* Cross-offer KPIs */}
      <section className="mt-6">
        {summaryLoading || !summary ? (
          <div className="glass-card flex items-center justify-center p-12">
            <Loader2 className="h-5 w-5 animate-spin text-cyan-300" />
          </div>
        ) : (
          <KpiGrid metrics={summary.totals} />
        )}
      </section>

      {/* Per-offer cards */}
      <section className="mt-8">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
            Suas ofertas
          </h2>
          <Link
            href="/ofertas"
            className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-300 hover:text-cyan-200"
          >
            Gerenciar →
          </Link>
        </div>

        {summary && summary.offers.length === 0 ? (
          <div className="glass-card flex flex-col items-center gap-3 p-8 text-center">
            <p className="text-[13px] text-white/55">
              Você ainda não tem nenhuma oferta cadastrada. Crie a primeira para começar
              a centralizar links e receber métricas.
            </p>
            <Button asChild size="sm">
              <Link href="/ofertas">
                <Plus className="h-3.5 w-3.5" />
                Criar primeira oferta
              </Link>
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {(summary?.offers ?? []).map((entry) => (
              <Link
                key={entry.offer.id}
                href={`/ofertas/${entry.offer.id}`}
                className="glass-card flex flex-col gap-3 p-4 transition hover:border-cyan-300/30"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="truncate text-[15px] font-semibold text-white">
                    {entry.offer.name}
                  </h3>
                  <ArrowRight className="h-4 w-4 shrink-0 text-cyan-300/70" />
                </div>
                <dl className="grid grid-cols-2 gap-2 text-[12px]">
                  <div>
                    <dt className="hud-label">Vendas</dt>
                    <dd className="mt-0.5 font-mono text-emerald-300">
                      {formatInt(entry.totals.sales)}
                    </dd>
                  </div>
                  <div>
                    <dt className="hud-label">Faturamento</dt>
                    <dd className="mt-0.5 font-mono text-emerald-300">
                      {formatBRL(entry.totals.revenue)}
                    </dd>
                  </div>
                  <div>
                    <dt className="hud-label">Investido</dt>
                    <dd className="mt-0.5 font-mono text-amber-300">
                      {formatBRL(entry.totals.spend)}
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
        )}
      </section>

      {/* Tools */}
      <section className="mt-12">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
            Ferramentas
          </h2>
          <Link
            href="/tools"
            className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-300 hover:text-cyan-200"
          >
            Ver todas →
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <ToolCard
            icon={<Layers className="h-6 w-6" />}
            title="Page Cloner"
            description="Clone páginas, sanitiza, personaliza e empacota como HTML ou ZIP."
            href="/tools/cloner"
          />
          <ToolCard
            icon={<Video className="h-6 w-6" />}
            title="VSL Downloader"
            description="Detecta e baixa VSLs de qualquer player como MP4."
            href="/tools/vsl"
            badge="Beta"
          />
          <ToolCard
            icon={<BarChart3 className="h-6 w-6" />}
            title="Upsell Analyzer"
            description="Taxas de aceite/rejeite/não-vista de funis de upsell."
            href="/tools/upsell-analyzer"
          />
          <ToolCard
            icon={<Webhook className="h-6 w-6" />}
            title="Webhook Tester"
            description="Simula webhooks de Hotmart, Kiwify, Stripe e outros."
            href="/tools/webhook-tester"
          />
          <ToolCard
            icon={<GitCompare className="h-6 w-6" />}
            title="Page Diff"
            description="Compara duas URLs e mostra o que mudou."
            href="/tools/page-diff"
          />
          <ToolCard
            icon={<Network className="h-6 w-6" />}
            title="Funnel Full Clone"
            description="Descobre e baixa o funil inteiro a partir do front."
            href="/tools/funnel-clone"
          />
        </div>
      </section>

      <div className="mt-12 flex justify-end">
        <Button asChild variant="ghost" size="sm">
          <Link href="/logs">
            <ScrollText className="h-3.5 w-3.5" />
            Atividade
          </Link>
        </Button>
      </div>

      <div className="h-16" aria-hidden />
    </HubShell>
  );
}

