'use client';

import { ToolGuard } from '@/components/auth/tool-guard';
import { CreativeStudio } from '@/components/creative-studio/creative-studio';
import { HubShell } from '@/components/hub/hub-shell';
import { type NicheView, apiClient } from '@/lib/api-client';
import { useQuery } from '@tanstack/react-query';
import { Clapperboard } from 'lucide-react';

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
              <Clapperboard className="h-6 w-6 text-cyan-300" />
            </div>
            <p className="hud-label">Video Studio · Processamento unificado</p>
            <h1 className="text-3xl font-bold tracking-tight text-white">
              Proteja, otimize e adapte seus criativos
            </h1>
            <p className="mx-auto max-w-2xl text-[14px] text-white/55">
              Comprima, redimensione, normalize e estenda seus vídeos. Quando precisar, ative o
              Phase Cancel no mesmo processamento para adicionar White Audio e verificar com
              AssemblyAI.
            </p>
          </header>

          <CreativeStudio niches={niches} nichesLoading={isLoading} />

          <p className="mt-8 text-center text-[10px] uppercase tracking-[0.18em] text-white/30">
            Video Studio · FFmpeg + Phase Cancel + AssemblyAI
          </p>
        </div>
      </ToolGuard>
    </HubShell>
  );
}
