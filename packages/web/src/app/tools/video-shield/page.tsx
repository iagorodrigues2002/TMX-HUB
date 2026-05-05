'use client';

import { useQuery } from '@tanstack/react-query';
import { Shield } from 'lucide-react';
import { HubShell } from '@/components/hub/hub-shell';
import { apiClient, type NicheView } from '@/lib/api-client';
import { NicheManager } from '@/components/shield/niche-manager';
import { ShieldJobsHistory } from '@/components/shield/shield-jobs-history';
import { ShieldProcessor } from '@/components/shield/shield-processor';

export const dynamic = 'force-dynamic';

export default function VideoShieldPage() {
  const { data, isLoading } = useQuery<NicheView[]>({
    queryKey: ['niches'],
    queryFn: () => apiClient.listNiches(),
  });
  const niches = data ?? [];

  return (
    <HubShell breadcrumb={['TOOLS', 'VIDEO SHIELD']}>
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 space-y-3 text-center">
          <div
            className="mx-auto grid h-14 w-14 place-items-center rounded-md border border-cyan-300/30"
            style={{
              background:
                'linear-gradient(135deg, rgba(20,184,166,0.18), rgba(34,211,238,0.05))',
            }}
          >
            <Shield className="h-6 w-6 text-cyan-300" />
          </div>
          <p className="hud-label">Module 009 — Video Shield</p>
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Phase Cancel · White Audio · AssemblyAI
          </h1>
          <p className="mx-auto max-w-2xl text-[14px] text-white/55">
            Aplica cancelamento de fase no áudio original (humanos ouvem normal, bots
            que downmixam pra mono recebem silêncio) e mistura um áudio "white" do
            nicho escolhido (sorteado aleatoriamente entre os cadastrados). Gera MP4
            pronto pra subir como criativo, opcionalmente comprimido e com transcrição
            de teste do AssemblyAI.
          </p>
        </header>

        <section className="mb-10">
          <ShieldProcessor niches={niches} />
        </section>

        <section className="mb-10">
          <ShieldJobsHistory />
        </section>

        <section className="mb-10">
          <NicheManager niches={niches} isLoading={isLoading} />
        </section>

        <p className="mt-8 text-center text-[10px] uppercase tracking-[0.18em] text-white/30">
          v0.1 · FFmpeg phase-cancel + libx264 + AssemblyAI verify (opcional)
        </p>
      </div>
    </HubShell>
  );
}
