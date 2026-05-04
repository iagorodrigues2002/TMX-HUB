import { BarChart3 } from 'lucide-react';
import { HubShell } from '@/components/hub/hub-shell';
import { UpsellAnalyzer } from '@/components/upsell/upsell-analyzer';

export default function UpsellAnalyzerPage() {
  return (
    <HubShell breadcrumb={['TOOLS', 'UPSELL ANALYZER']}>
      <div className="mx-auto max-w-4xl">
        <header className="mb-8 space-y-3 text-center">
          <div
            className="mx-auto grid h-14 w-14 place-items-center rounded-md border border-cyan-300/30"
            style={{
              background:
                'linear-gradient(135deg, rgba(20,184,166,0.18), rgba(34,211,238,0.05))',
            }}
          >
            <BarChart3 className="h-6 w-6 text-cyan-300" />
          </div>
          <p className="hud-label">Module 003 — Upsell Analyzer</p>
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Analise as taxas de aceite, rejeite e não-vista
          </h1>
          <p className="mx-auto max-w-2xl text-[14px] text-white/55">
            Suba os relatórios de Front e Upsell de qualquer plataforma de checkout. O
            cálculo roda 100% no seu navegador — nenhum dado sai daqui.
          </p>
        </header>

        <UpsellAnalyzer />

        <p className="mt-8 text-center text-[10px] uppercase tracking-[0.18em] text-white/30">
          v0.7 ACTIVE · CLIENT-SIDE ONLY · NO BACKEND
        </p>
      </div>
    </HubShell>
  );
}
