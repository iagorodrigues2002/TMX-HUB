import { Video } from 'lucide-react';
import { HubShell } from '@/components/hub/hub-shell';
import { VslInputForm } from '@/components/vsl/vsl-input-form';

export default function VslPage() {
  return (
    <HubShell breadcrumb={['TOOLS', 'VSL DOWNLOADER']}>
      <div className="mx-auto max-w-2xl">
        <header className="mb-8 space-y-3 text-center">
          <div
            className="mx-auto grid h-14 w-14 place-items-center rounded-md border border-cyan-300/30"
            style={{
              background:
                'linear-gradient(135deg, rgba(20,184,166,0.18), rgba(34,211,238,0.05))',
            }}
          >
            <Video className="h-6 w-6 text-cyan-300" />
          </div>
          <p className="hud-label">Module 002 — VSL Downloader</p>
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Baixe vídeos de qualquer player
          </h1>
          <p className="text-[14px] text-white/55">
            Cole a URL da página, o sistema detecta o manifest do vídeo, contorna filtros
            comuns de tráfego e remuxa pra MP4.
          </p>
        </header>

        <div className="glass-card p-8">
          <VslInputForm />
        </div>

        <p className="mt-6 text-center text-[10px] uppercase tracking-[0.18em] text-white/30">
          v0.5 ACTIVE · USE APENAS EM CONTEÚDO QUE VOCÊ POSSUI · SEM PROXY
        </p>
      </div>
    </HubShell>
  );
}
