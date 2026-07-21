'use client';

import { ToolGuard } from '@/components/auth/tool-guard';
import { HubShell } from '@/components/hub/hub-shell';
import { OfferList } from '@/components/ofertas/offer-list';
import { Target } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default function OfertasIndexPage() {
  return (
    <HubShell breadcrumb={['OFERTAS']}>
      <ToolGuard tool="ofertas">
        <header className="mb-6 space-y-3">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-cyan-300" />
            <p className="hud-label">Operator Console · Ofertas</p>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Suas ofertas em produção</h1>
          <p className="max-w-2xl text-[14px] text-white/55">
            Conecte suas operações à UTMify e acompanhe investimento, faturamento, ROAS e desempenho
            de cada anúncio em uma única tela.
          </p>
        </header>

        <OfferList />
      </ToolGuard>
    </HubShell>
  );
}
