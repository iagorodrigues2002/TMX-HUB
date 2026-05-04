'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  GitCompare,
  Layers,
  Loader2,
  Network,
  RefreshCw,
  ScrollText,
  Search,
  Video,
  Webhook,
} from 'lucide-react';
import { HubShell } from '@/components/hub/hub-shell';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api-client';

const KIND_META = {
  clone: { label: 'Page Cloner', icon: Layers, href: (id: string) => `/tools/cloner/jobs/${id}`, color: 'text-cyan-300' },
  vsl: { label: 'VSL Downloader', icon: Video, href: (id: string) => `/tools/vsl/jobs/${id}`, color: 'text-cyan-300' },
  funnel: { label: 'Funnel Clone', icon: Network, href: (id: string) => `/tools/funnel-clone/jobs/${id}`, color: 'text-cyan-300' },
  inspect: { label: 'Inspect', icon: Search, href: () => '/tools/cloner', color: 'text-white/60' },
  webhook: { label: 'Webhook Tester', icon: Webhook, href: () => '/tools/webhook-tester', color: 'text-white/60' },
  'page-diff': { label: 'Page Diff', icon: GitCompare, href: () => '/tools/page-diff', color: 'text-white/60' },
} as const;

type KindKey = keyof typeof KIND_META;

const KIND_OPTIONS: Array<{ value: KindKey | 'all'; label: string }> = [
  { value: 'all', label: 'Tudo' },
  { value: 'clone', label: 'Page Cloner' },
  { value: 'vsl', label: 'VSL Downloader' },
  { value: 'funnel', label: 'Funnel Clone' },
  { value: 'inspect', label: 'Inspect' },
  { value: 'webhook', label: 'Webhook' },
  { value: 'page-diff', label: 'Page Diff' },
];

function formatRelative(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diffSec < 60) return `${diffSec}s atrás`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}min atrás`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h atrás`;
  return d.toLocaleString('pt-BR');
}

function statusColor(status: string): string {
  const s = status.toLowerCase();
  if (s === 'ready' || s === 'inspected' || s.startsWith('http 2')) return 'text-emerald-300';
  if (s === 'failed' || s.startsWith('http 4') || s.startsWith('http 5')) return 'text-red-300';
  return 'text-amber-300';
}

export default function LogsPage() {
  const [filter, setFilter] = useState<KindKey | 'all'>('all');
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['activity'],
    queryFn: () => apiClient.listActivity(),
    refetchOnWindowFocus: false,
  });
  const entries = data ?? [];
  const filtered = filter === 'all' ? entries : entries.filter((e) => e.kind === filter);

  return (
    <HubShell breadcrumb={['LOGS']}>
      <header className="mb-6 space-y-3">
        <div className="flex items-center gap-2">
          <ScrollText className="h-5 w-5 text-cyan-300" />
          <p className="hud-label">Activity Log</p>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-white">Sua atividade recente</h1>
        <p className="max-w-xl text-[14px] text-white/55">
          Histórico dos jobs e ações que você rodou em qualquer ferramenta. Só você vê isso —
          cada usuário tem seu próprio feed.
        </p>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {KIND_OPTIONS.map((opt) => (
          <Button
            key={opt.value}
            type="button"
            size="sm"
            variant={filter === opt.value ? 'default' : 'outline'}
            onClick={() => setFilter(opt.value)}
          >
            {opt.label}
            {opt.value !== 'all' && (
              <span className="ml-1.5 text-[10px] text-white/45">
                {entries.filter((e) => e.kind === opt.value).length}
              </span>
            )}
          </Button>
        ))}
        <div className="ml-auto">
          <Button type="button" size="sm" variant="ghost" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Atualizar
          </Button>
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="h-6 w-6 animate-spin text-cyan-300" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-[13px] text-white/40">
            Nenhuma atividade registrada {filter !== 'all' ? 'para esse filtro' : 'ainda'}.
          </div>
        ) : (
          <ul className="divide-y divide-white/[0.04]">
            {filtered.map((e) => {
              const meta = KIND_META[e.kind];
              const Icon = meta.icon;
              return (
                <li key={`${e.kind}-${e.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-white/[0.02]">
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded border border-white/[0.06] bg-white/[0.03] ${meta.color}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/85">
                        {meta.label}
                      </p>
                      <span className={`text-[11px] font-mono ${statusColor(e.status)}`}>
                        {e.status}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-[13px] text-white/65">{e.label}</p>
                  </div>
                  <span className="shrink-0 text-[11px] text-white/40">{formatRelative(e.createdAt)}</span>
                  <Button asChild size="sm" variant="ghost">
                    <Link href={meta.href(e.id)}>Abrir</Link>
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </HubShell>
  );
}
