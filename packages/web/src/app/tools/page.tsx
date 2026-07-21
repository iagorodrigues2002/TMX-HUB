'use client';

import { HubShell } from '@/components/hub/hub-shell';
import { ToolCard } from '@/components/hub/tool-card';
import type { ToolKey } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { BarChart3, FileAudio, Layers, Network, Shield, Video, Webhook } from 'lucide-react';

interface ToolEntry {
  tool?: ToolKey;
  card: React.ReactNode;
}

export default function ToolsIndexPage() {
  const { user } = useAuth();
  const restricted = user && user.role !== 'admin' && (user.allowedTools?.length ?? 0) > 0;
  const allowed = user?.allowedTools ?? [];

  const all: ToolEntry[] = [
    {
      tool: 'cloner',
      card: (
        <ToolCard
          key="cloner"
          icon={<Layers className="h-6 w-6" />}
          title="Page Cloner"
          description="Clone qualquer página, remove scripts, substitui checkout e empacota como HTML ou ZIP."
          href="/tools/cloner"
        />
      ),
    },
    {
      tool: 'vsl',
      card: (
        <ToolCard
          key="vsl"
          icon={<Video className="h-6 w-6" />}
          title="VSL Downloader"
          description="Detecta o vídeo de VSLs em VTURB, Panda, Vimeo, Wistia, Hotmart e outros players, e baixa como MP4."
          href="/tools/vsl"
          badge="Beta"
        />
      ),
    },
    {
      tool: 'upsell-analyzer',
      card: (
        <ToolCard
          key="upsell-analyzer"
          icon={<BarChart3 className="h-6 w-6" />}
          title="Upsell Analyzer"
          description="Calcula taxas de aceite, rejeite e não-vista de funis de upsell. Funciona com Hotmart, Kiwify, Eduzz, Monetizze, Braip, Ticto e mais."
          href="/tools/upsell-analyzer"
        />
      ),
    },
    {
      tool: 'webhook-tester',
      card: (
        <ToolCard
          key="webhook-tester"
          icon={<Webhook className="h-6 w-6" />}
          title="Webhook Tester"
          description="Simula webhooks de Hotmart, Kiwify, Eduzz, Stripe e outros. Edita o payload, dispara e vê a resposta — sem precisar fazer venda real."
          href="/tools/webhook-tester"
          badge="Novo"
        />
      ),
    },
    {
      tool: 'funnel-clone',
      card: (
        <ToolCard
          key="funnel-clone"
          icon={<Network className="h-6 w-6" />}
          title="Funnel Full Clone"
          description="Descobre o funil inteiro a partir do front (segue CTAs, upsells, downsells, thanks) e empacota tudo num ZIP organizado por etapa."
          href="/tools/funnel-clone"
          badge="Novo"
        />
      ),
    },
    {
      tool: 'video-shield',
      card: (
        <ToolCard
          key="video-shield"
          icon={<Shield className="h-6 w-6" />}
          title="Video Studio"
          description="Proteja, comprima, normalize, redimensione e estenda criativos em uma única central de processamento."
          href="/tools/video-shield"
          badge="Novo"
        />
      ),
    },
    {
      // Sempre visível (placeholder, disabled).
      card: (
        <ToolCard
          key="vsl-transcriber"
          icon={<FileAudio className="h-6 w-6" />}
          title="VSL Transcriber"
          description="Transcreve a VSL com timestamps e identifica seções (gancho, prova, oferta, escassez, CTA) — em cima do MP4 baixado pelo VSL Downloader."
          href="#"
          badge="Em breve"
          disabled
        />
      ),
    },
  ];

  const visible = all.filter((entry) => {
    if (!entry.tool) return !restricted; // placeholders só pra acesso total
    if (!restricted) return true;
    return entry.tool === 'video-shield'
      ? allowed.includes('video-shield') || allowed.includes('creative-studio')
      : allowed.includes(entry.tool);
  });

  return (
    <HubShell breadcrumb={['TOOLS']}>
      <header className="space-y-3">
        <p className="hud-label">Operator Console · Tools</p>
        <h1 className="text-3xl font-bold leading-tight tracking-tight text-white md:text-4xl">
          Ferramentas disponíveis
        </h1>
        <p className="max-w-xl text-[14px] text-white/55">
          {restricted
            ? 'Sua conta tem acesso restrito. Apenas as ferramentas abaixo estão liberadas.'
            : 'Selecione uma ferramenta abaixo para abrir. Novos módulos aparecem aqui conforme são liberados.'}
        </p>
      </header>

      <section className="mt-10">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {visible.map((e) => e.card)}
        </div>
      </section>

      <div className="h-16" aria-hidden />
    </HubShell>
  );
}
