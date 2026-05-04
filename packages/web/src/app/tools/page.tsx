import { Layers, Sparkles, Video } from 'lucide-react';
import { HubShell } from '@/components/hub/hub-shell';
import { ToolCard } from '@/components/hub/tool-card';

export default function ToolsIndexPage() {
  return (
    <HubShell breadcrumb={['TOOLS']}>
      <header className="space-y-3">
        <p className="hud-label">Operator Console · Tools</p>
        <h1 className="text-3xl font-bold leading-tight tracking-tight text-white md:text-4xl">
          Ferramentas disponíveis
        </h1>
        <p className="max-w-xl text-[14px] text-white/55">
          Selecione uma ferramenta abaixo para abrir. Novos módulos aparecem aqui conforme são liberados.
        </p>
      </header>

      <section className="mt-10">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <ToolCard
            icon={<Layers className="h-6 w-6" />}
            title="Page Cloner"
            description="Clone qualquer página, remove scripts, substitui checkout e empacota como HTML ou ZIP."
            href="/tools/cloner"
          />
          <ToolCard
            icon={<Video className="h-6 w-6" />}
            title="VSL Downloader"
            description="Detecta o vídeo de VSLs em VTURB, Panda, Vimeo, Wistia, Hotmart e outros players, e baixa como MP4."
            href="/tools/vsl"
            badge="Beta"
          />
          <ToolCard
            icon={<Sparkles className="h-6 w-6" />}
            title="Próxima ferramenta"
            description="Em desenvolvimento. Slot reservado para o próximo módulo do hub."
            href="#"
            badge="Em breve"
            disabled
          />
        </div>
      </section>

      <div className="h-16" aria-hidden />
    </HubShell>
  );
}
