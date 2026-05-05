import { Shuffle } from 'lucide-react';
import { HubShell } from '@/components/hub/hub-shell';
import { CloakerGenerator } from '@/components/cloaker/cloaker-generator';

export default function CloakerUrlsPage() {
  return (
    <HubShell breadcrumb={['TOOLS', 'CLOAKER URLS']}>
      <div className="mx-auto max-w-4xl">
        <header className="mb-8 space-y-3 text-center">
          <div
            className="mx-auto grid h-14 w-14 place-items-center rounded-md border border-cyan-300/30"
            style={{
              background:
                'linear-gradient(135deg, rgba(20,184,166,0.18), rgba(34,211,238,0.05))',
            }}
          >
            <Shuffle className="h-6 w-6 text-cyan-300" />
          </div>
          <p className="hud-label">Module 008 — Cloaker URL Generator</p>
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Gera URLs com parâmetros aleatorizados
          </h1>
          <p className="mx-auto max-w-2xl text-[14px] text-white/55">
            Monta lotes de URLs com parâmetros únicos pra alimentar campanhas com cloaker
            — token, ref, hex, UUID, sorteio de lista, valores fixos. Crypto-grade
            random, deduplicação opcional, exporta como .txt.
          </p>
        </header>

        <CloakerGenerator />

        <p className="mt-8 text-center text-[10px] uppercase tracking-[0.18em] text-white/30">
          v0.1 · 100% client-side · randomness via crypto.getRandomValues
        </p>
      </div>
    </HubShell>
  );
}
