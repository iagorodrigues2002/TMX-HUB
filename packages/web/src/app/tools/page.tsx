import {
  BarChart3,
  FileAudio,
  GitCompare,
  Layers,
  Network,
  Video,
  Webhook,
} from 'lucide-react';
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
            icon={<BarChart3 className="h-6 w-6" />}
            title="Upsell Analyzer"
            description="Calcula taxas de aceite, rejeite e não-vista de funis de upsell. Funciona com Hotmart, Kiwify, Eduzz, Monetizze, Braip, Ticto e mais."
            href="/tools/upsell-analyzer"
          />
          <ToolCard
            icon={<Webhook className="h-6 w-6" />}
            title="Webhook Tester"
            description="Simula webhooks de Hotmart, Kiwify, Eduzz, Stripe e outros. Edita o payload, dispara e vê a resposta — sem precisar fazer venda real."
            href="/tools/webhook-tester"
            badge="Novo"
          />
          <ToolCard
            icon={<GitCompare className="h-6 w-6" />}
            title="Page Diff"
            description="Compara duas URLs e mostra exatamente o que mudou no texto visível. Útil pra monitorar competidores ou validar mudanças no próprio funil."
            href="/tools/page-diff"
            badge="Novo"
          />
          <ToolCard
            icon={<Network className="h-6 w-6" />}
            title="Funnel Full Clone"
            description="Descobre o funil inteiro a partir do front (segue CTAs, upsells, downsells, thanks) e empacota tudo num ZIP organizado por etapa."
            href="/tools/funnel-clone"
            badge="Novo"
          />
          <ToolCard
            icon={<FileAudio className="h-6 w-6" />}
            title="VSL Transcriber"
            description="Transcreve a VSL com timestamps e identifica seções (gancho, prova, oferta, escassez, CTA) — em cima do MP4 baixado pelo VSL Downloader."
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
