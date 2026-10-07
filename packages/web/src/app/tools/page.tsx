'use client';

import { HubShell } from '@/components/hub/hub-shell';
import { ToolCard } from '@/components/hub/tool-card';
import { useAuth } from '@/lib/auth-context';
import { visibleToolCatalog } from '@/lib/tool-catalog';

export default function ToolsIndexPage() {
  const { user } = useAuth();
  const restricted = user && user.role !== 'admin' && (user.allowedTools?.length ?? 0) > 0;
  const visible = visibleToolCatalog(user);

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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map(({ id, icon: Icon, title, description, href, badge, disabled }) => (
            <div
              key={id}
              className={`transition-transform duration-[180ms] ease-out motion-reduce:transition-none ${disabled ? '' : 'hover:-translate-y-0.5 hover:-rotate-1 motion-reduce:hover:translate-y-0 motion-reduce:hover:rotate-0'} ${badge && ['BETA', 'NOVO'].includes(badge.toUpperCase()) ? '[&_.tool-card_span]:animate-pulse [&_.tool-card_span]:[animation-duration:2.4s] motion-reduce:[&_.tool-card_span]:animate-none' : ''}`}
            >
              <ToolCard
                icon={<Icon className="h-6 w-6" />}
                title={title}
                description={description}
                href={href}
                badge={badge}
                disabled={disabled}
              />
            </div>
          ))}
        </div>
      </section>

      <div className="h-16" aria-hidden />
    </HubShell>
  );
}
