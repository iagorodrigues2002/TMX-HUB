import { Network } from 'lucide-react';
import { HubShell } from '@/components/hub/hub-shell';
import { FunnelInputForm } from '@/components/funnel/funnel-input-form';

export default function FunnelClonePage() {
  return (
    <HubShell breadcrumb={['TOOLS', 'FUNNEL CLONE']}>
      <div className="mx-auto max-w-2xl">
        <header className="mb-8 space-y-3 text-center">
          <div
            className="mx-auto grid h-14 w-14 place-items-center rounded-md border border-cyan-300/30"
            style={{
              background:
                'linear-gradient(135deg, rgba(20,184,166,0.18), rgba(34,211,238,0.05))',
            }}
          >
            <Network className="h-6 w-6 text-cyan-300" />
          </div>
          <p className="hud-label">Module 006 — Funnel Full Clone</p>
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Descubra e baixe o funil inteiro
          </h1>
          <p className="text-[14px] text-white/55">
            Cole a URL inicial. O sistema segue os CTAs, descobre upsells, downsells e
            thank-you pages, e empacota tudo num único ZIP organizado por etapa.
          </p>
        </header>

        <div className="glass-card p-8">
          <FunnelInputForm />
        </div>

        <p className="mt-6 text-center text-[10px] uppercase tracking-[0.18em] text-white/30">
          v0.8 ACTIVE · BFS · APENAS MESMO DOMÍNIO
        </p>
      </div>
    </HubShell>
  );
}
