import { Clapperboard } from 'lucide-react';
import { ToolGuard } from '@/components/auth/tool-guard';
import { CreativeStudio } from '@/components/creative-studio/creative-studio';
import { HubShell } from '@/components/hub/hub-shell';

export default function CreativeStudioPage() {
  return (
    <HubShell breadcrumb={['TOOLS', 'CREATIVE STUDIO']}>
      <ToolGuard tool="creative-studio">
        <div className="mx-auto max-w-5xl">
          <header className="mb-8 space-y-3 text-center">
            <Clapperboard className="mx-auto h-10 w-10 text-cyan-300" />
            <p className="hud-label">Module 010 · Creative Studio</p>
            <h1 className="text-3xl font-bold tracking-tight text-white">Otimize e adapte seus criativos</h1>
            <p className="mx-auto max-w-2xl text-sm text-white/55">Comprima, normalize, converta proporções e estenda vídeos com processamento assíncrono no Railway.</p>
          </header>
          <CreativeStudio />
        </div>
      </ToolGuard>
    </HubShell>
  );
}
