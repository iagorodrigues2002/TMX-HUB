'use client';

import Link from 'next/link';
import { Download, LayoutDashboard } from 'lucide-react';
import { HubShell } from '@/components/hub/hub-shell';
import { OfferList } from '@/components/dashboard/offer-list';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

export default function DashboardsIndexPage() {
  return (
    <HubShell breadcrumb={['DASHBOARDS']}>
      <header className="mb-6 space-y-3">
        <div className="flex items-center gap-2">
          <LayoutDashboard className="h-5 w-5 text-cyan-300" />
          <p className="hud-label">Operator Console · Dashboards</p>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-white">
          Painéis das suas ofertas
        </h1>
        <p className="max-w-xl text-[14px] text-white/55">
          Cada oferta tem sua própria dashboard com vendas, faturamento, gasto e métricas
          calculadas. A home agrega tudo.{' '}
          <Link href="/" className="text-cyan-300 hover:text-cyan-200">
            Ver visão geral →
          </Link>
        </p>
      </header>

      <section className="glass-card mb-6 flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="space-y-1">
          <p className="hud-label">n8n adapter</p>
          <p className="max-w-2xl text-[13px] text-white/65">
            Workflow pronto pra importar no seu n8n. Faz auth na UTMify, busca os dados
            (janela diária pra contornar o timeout 524 da Cloudflare) e posta no endpoint{' '}
            <code className="text-white/85">/v1/offers/:id/ingest</code>. Você só edita o node{' '}
            <strong>⚙️ Config</strong> com sua URL, token TMX, offer ID e dashboardId UTMify.
          </p>
        </div>
        <Button asChild>
          <a href="/tmx-utmify-ingest.n8n.json" download="tmx-utmify-ingest.n8n.json">
            <Download className="h-4 w-4" />
            Baixar workflow.json
          </a>
        </Button>
      </section>

      <OfferList />
    </HubShell>
  );
}
