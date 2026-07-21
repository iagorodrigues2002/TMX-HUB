'use client';

import { useQuery } from '@tanstack/react-query';
import { Clapperboard, Shield } from 'lucide-react';
import { ToolGuard } from '@/components/auth/tool-guard';
import { HubShell } from '@/components/hub/hub-shell';
import { apiClient, type NicheView } from '@/lib/api-client';
import { NicheManager } from '@/components/shield/niche-manager';
import { ShieldJobsHistory } from '@/components/shield/shield-jobs-history';
import { ShieldProcessor } from '@/components/shield/shield-processor';
import { CreativeStudio } from '@/components/creative-studio/creative-studio';

export const dynamic = 'force-dynamic';

export default function VideoShieldPage() {
  const { data, isLoading } = useQuery<NicheView[]>({
    queryKey: ['niches'],
    queryFn: () => apiClient.listNiches(),
  });
  const niches = data ?? [];

  return (
    <HubShell breadcrumb={['TOOLS', 'VIDEO STUDIO']}>
      <ToolGuard tool="video-shield">
        <div className="mx-auto max-w-5xl">
          <header className="mb-8 space-y-3 text-center">
            <div
              className="mx-auto grid h-14 w-14 place-items-center rounded-md border border-cyan-300/30"
              style={{
                background: 'linear-gradient(135deg, rgba(20,184,166,0.18), rgba(34,211,238,0.05))',
              }}
            >
              <Shield className="h-6 w-6 text-cyan-300" />
            </div>
            <p className="hud-label">Modules 009 + 010 · Video Studio</p>
            <h1 className="text-3xl font-bold tracking-tight text-white">
              Proteja, otimize e adapte seus criativos
            </h1>
            <p className="mx-auto max-w-2xl text-[14px] text-white/55">
              Uma única central para aplicar Video Shield com Phase Cancel, White Audio e
              AssemblyAI, ou preparar vídeos com compressão, normalização, novos formatos e extensão
              de duração.
            </p>
          </header>

          <section className="mb-12 space-y-4">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl border border-cyan-300/20 bg-cyan-300/[0.06] text-cyan-300">
                <Shield className="h-5 w-5" />
              </span>
              <div>
                <p className="hud-label">Video Shield</p>
                <h2 className="text-xl font-semibold text-white">
                  Phase Cancel · White Audio · AssemblyAI
                </h2>
              </div>
            </div>
            <ShieldProcessor niches={niches} />
          </section>

          <section className="mb-10">
            <ShieldJobsHistory />
          </section>

          <section className="mb-10">
            <NicheManager niches={niches} isLoading={isLoading} />
          </section>

          <section className="mb-12 space-y-4 border-t border-white/[0.08] pt-10">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl border border-cyan-300/20 bg-cyan-300/[0.06] text-cyan-300">
                <Clapperboard className="h-5 w-5" />
              </span>
              <div>
                <p className="hud-label">Creative Studio</p>
                <h2 className="text-xl font-semibold text-white">
                  Otimize e adapte seus criativos
                </h2>
              </div>
            </div>
            <CreativeStudio />
          </section>

          <p className="mt-8 text-center text-[10px] uppercase tracking-[0.18em] text-white/30">
            Video Studio · FFmpeg + Phase Cancel + AssemblyAI
          </p>
        </div>
      </ToolGuard>
    </HubShell>
  );
}
