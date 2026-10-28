'use client';

import { HubShell } from '@/components/hub/hub-shell';
import { ToolCard } from '@/components/hub/tool-card';
import { OverviewDashboard } from '@/components/overview/overview-dashboard';
import { Button } from '@/components/ui/button';
import { canAccessTool } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { visibleToolCatalog } from '@/lib/tool-catalog';
import { ScrollText } from 'lucide-react';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default function HubLandingPage() {
  const { user } = useAuth();
  const hasOffers = canAccessTool(user, 'ofertas');
  const homeTools = visibleToolCatalog(user, { homeOnly: true });

  const firstName = user?.name?.split(/\s+/)[0] ?? 'Operador';

  return (
    <HubShell>
      <header className="tmx-command-hero animate-[tmx-reveal_240ms_cubic-bezier(0,0,0.2,1)_both] rounded-2xl border border-cyan-300/15 p-5 motion-reduce:animate-none sm:p-7 md:p-8">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <p className="hud-label">Operator Console</p>
          <span className="flex items-center gap-2 rounded-full border border-emerald-300/15 bg-emerald-300/[0.05] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-emerald-200/70">
            <span className="status-dot" aria-hidden /> Sistema online
          </span>
        </div>
        <h1 className="text-3xl font-bold leading-tight tracking-tight text-white md:text-4xl">
          Olá,{' '}
          <span
            className="bg-clip-text text-transparent"
            style={{
              backgroundImage:
                'linear-gradient(90deg, var(--accent-from) 0%, var(--accent-to) 100%)',
            }}
          >
            {firstName}
          </span>
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-white/55">
          {hasOffers
            ? 'Acompanhe pedidos, receita e liquidação de todas as suas ofertas em um só lugar.'
            : 'Seu espaço de trabalho mostra somente as ferramentas liberadas pelo administrador.'}
        </p>
      </header>

      {hasOffers && (
        <section className="mt-8" aria-label="Visão geral da conta">
          <OverviewDashboard scope="account" />
        </section>
      )}

      {/* Tools */}
      <section className="mt-12">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-white/55">
            Ferramentas
          </h2>
          <Link
            href="/tools"
            className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300 hover:text-cyan-200"
          >
            Ver todas →
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {homeTools.map(({ id, icon: Icon, title, description, href, badge, disabled }) => (
            <ToolCard
              key={id}
              icon={<Icon className="h-6 w-6" />}
              title={title}
              description={description}
              href={href}
              badge={badge}
              disabled={disabled}
            />
          ))}
        </div>
      </section>

      {canAccessTool(user, 'logs') && (
        <div className="mt-12 flex justify-end">
          <Button asChild variant="ghost" size="sm">
            <Link href="/logs">
              <ScrollText className="h-3.5 w-3.5" />
              Atividade
            </Link>
          </Button>
        </div>
      )}

      <div className="h-16" aria-hidden />
    </HubShell>
  );
}
