'use client';

import { Download, Target } from 'lucide-react';
import { HubShell } from '@/components/hub/hub-shell';
import { OfferList } from '@/components/ofertas/offer-list';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

export default function OfertasIndexPage() {
  return (
    <HubShell breadcrumb={['OFERTAS']}>
      <header className="mb-6 space-y-3">
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 text-cyan-300" />
          <p className="hud-label">Operator Console · Ofertas</p>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-white">
          Suas ofertas em produção
        </h1>
        <p className="max-w-2xl text-[14px] text-white/55">
          Cada oferta centraliza nome, status, links de Front e Upsell (com páginas White
          e Black) e métricas vindas da UTMify via n8n. Edite uma oferta pra adicionar
          mais links a qualquer momento.
        </p>
      </header>

      <section className="glass-card mb-6 flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="space-y-1">
          <p className="hud-label">n8n adapter</p>
          <p className="max-w-2xl text-[13px] text-white/65">
            Workflow pronto pra importar no seu n8n. Faz auth na UTMify, busca os dados
            (janela diária pra contornar o timeout 524 da Cloudflare) e posta no endpoint{' '}
            <code className="text-white/85">/v1/offers/:id/ingest</code>.
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
