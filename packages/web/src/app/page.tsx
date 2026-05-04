import { Layers, Sparkles, Wand2 } from 'lucide-react';
import { HubShell } from '@/components/hub/hub-shell';
import { ToolCard } from '@/components/hub/tool-card';

export default function HubLandingPage() {
  return (
    <HubShell>
      <header className="space-y-3">
        <p className="hud-label">Operator Console</p>
        <h1 className="text-3xl font-bold leading-tight tracking-tight text-white md:text-4xl">
          Bem-vindo ao{' '}
          <span
            className="bg-clip-text text-transparent"
            style={{ backgroundImage: 'linear-gradient(90deg, #0E7C86 0%, #22D3EE 100%)' }}
          >
            TMX HUB
          </span>
        </h1>
        <p className="max-w-xl text-[14px] text-white/55">
          Conjunto de ferramentas internas para captura, edição e empacotamento de páginas.
          Selecione um módulo abaixo para iniciar uma operação.
        </p>
      </header>

      <section className="mt-10">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
            Ferramentas disponíveis
          </h2>
          <span className="hud-label">01 / 03</span>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <ToolCard
            icon={<Layers className="h-6 w-6" />}
            title="Page Cloner"
            description="Clone qualquer página, remove scripts e personalize forms/links."
            href="/tools/cloner"
          />
          <ToolCard
            icon={<Sparkles className="h-6 w-6" />}
            title="Próxima ferramenta"
            description="Em desenvolvimento. Slot reservado para o próximo módulo do hub."
            href="#"
            badge="Em breve"
            disabled
          />
          <ToolCard
            icon={<Wand2 className="h-6 w-6" />}
            title="Próxima ferramenta"
            description="Em desenvolvimento. Slot reservado para o próximo módulo do hub."
            href="#"
            badge="Em breve"
            disabled
          />
        </div>
      </section>

      <section className="mt-12">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
            Atividade recente
          </h2>
          <span className="hud-label">Live feed</span>
        </div>

        <div className="glass-card flex min-h-[160px] items-center justify-center px-6 py-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
            Nenhuma atividade registrada
          </p>
        </div>
      </section>

      <div className="h-16" aria-hidden />
    </HubShell>
  );
}
