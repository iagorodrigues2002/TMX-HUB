'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  GitCompare,
  Layers,
  Network,
  ScrollText,
  Video,
  Webhook,
} from 'lucide-react';
import { HubShell } from '@/components/hub/hub-shell';
import { ToolCard } from '@/components/hub/tool-card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth-context';
import { apiClient } from '@/lib/api-client';

const KIND_LABEL: Record<string, string> = {
  clone: 'Page Cloner',
  vsl: 'VSL Downloader',
  funnel: 'Funnel Clone',
  inspect: 'Inspect',
  webhook: 'Webhook',
  'page-diff': 'Page Diff',
};

function formatRelative(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diffSec < 60) return `${diffSec}s`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}min`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h`;
  return d.toLocaleDateString('pt-BR');
}

export default function HubLandingPage() {
  const { user } = useAuth();
  const { data: activity } = useQuery({
    queryKey: ['activity', 'recent'],
    queryFn: () => apiClient.listActivity(),
    refetchOnWindowFocus: false,
    enabled: Boolean(user),
  });
  const recent = (activity ?? []).slice(0, 5);

  const firstName = user?.name?.split(/\s+/)[0] ?? 'Operador';

  return (
    <HubShell>
      <header className="space-y-3">
        <p className="hud-label">Operator Console</p>
        <h1 className="text-3xl font-bold leading-tight tracking-tight text-white md:text-4xl">
          Olá, <span className="bg-clip-text text-transparent" style={{ backgroundImage: 'linear-gradient(90deg, #0E7C86 0%, #22D3EE 100%)' }}>{firstName}</span>
        </h1>
        <p className="max-w-xl text-[14px] text-white/55">
          Bem-vindo ao TMX HUB. Conjunto de ferramentas internas para captura, edição,
          análise e operação de funis e VSLs.
        </p>
      </header>

      <section className="mt-10">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
            Ferramentas disponíveis
          </h2>
          <Link href="/tools" className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-300 hover:text-cyan-200">
            Ver todas →
          </Link>
        </div>

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
            description="Calcula taxas de aceite, rejeite e não-vista de funis de upsell. Multi-checkout."
            href="/tools/upsell-analyzer"
          />
          <ToolCard
            icon={<Webhook className="h-6 w-6" />}
            title="Webhook Tester"
            description="Simula webhooks de Hotmart, Kiwify, Eduzz, Stripe e outros. Sem precisar fazer venda real."
            href="/tools/webhook-tester"
          />
          <ToolCard
            icon={<GitCompare className="h-6 w-6" />}
            title="Page Diff"
            description="Compara duas URLs e mostra exatamente o que mudou no texto visível."
            href="/tools/page-diff"
          />
          <ToolCard
            icon={<Network className="h-6 w-6" />}
            title="Funnel Full Clone"
            description="Descobre e baixa o funil inteiro a partir do front (segue CTAs, upsells, thanks)."
            href="/tools/funnel-clone"
          />
        </div>
      </section>

      <section className="mt-12">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
            Atividade recente
          </h2>
          <Link href="/logs" className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-300 hover:text-cyan-200">
            Ver tudo →
          </Link>
        </div>

        <div className="glass-card overflow-hidden">
          {recent.length === 0 ? (
            <div className="flex min-h-[160px] items-center justify-center px-6 py-8">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
                Nenhuma atividade registrada
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-white/[0.04]">
              {recent.map((e) => (
                <li key={`${e.kind}-${e.id}`} className="flex items-center gap-4 px-4 py-3">
                  <span className="rounded-sm border border-cyan-300/30 bg-cyan-300/[0.04] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-300">
                    {KIND_LABEL[e.kind] ?? e.kind}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-white/70">
                    {e.label}
                  </span>
                  <span className="text-[11px] font-mono text-white/45">{e.status}</span>
                  <span className="text-[11px] text-white/35">{formatRelative(e.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {recent.length > 0 && (
          <div className="mt-3 flex justify-end">
            <Button asChild variant="ghost" size="sm">
              <Link href="/logs">
                <ScrollText className="h-3.5 w-3.5" />
                Abrir log completo
              </Link>
            </Button>
          </div>
        )}
      </section>

      <div className="h-16" aria-hidden />
    </HubShell>
  );
}

