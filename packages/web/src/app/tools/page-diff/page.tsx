import { GitCompare } from 'lucide-react';
import { HubShell } from '@/components/hub/hub-shell';
import { PageDiff } from '@/components/diff/page-diff';

export default function PageDiffPage() {
  return (
    <HubShell breadcrumb={['TOOLS', 'PAGE DIFF']}>
      <div className="mx-auto max-w-4xl">
        <header className="mb-8 space-y-3 text-center">
          <div
            className="mx-auto grid h-14 w-14 place-items-center rounded-md border border-cyan-300/30"
            style={{
              background:
                'linear-gradient(135deg, rgba(20,184,166,0.18), rgba(34,211,238,0.05))',
            }}
          >
            <GitCompare className="h-6 w-6 text-cyan-300" />
          </div>
          <p className="hud-label">Module 005 — Page Diff</p>
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Compare duas versões de uma página
          </h1>
          <p className="mx-auto max-w-2xl text-[14px] text-white/55">
            Renderiza as duas URLs com Playwright (entende SPAs), extrai o texto
            visível e mostra exatamente o que mudou — útil para monitorar
            competidores ou validar mudanças num funil próprio.
          </p>
        </header>

        <PageDiff />

        <p className="mt-8 text-center text-[10px] uppercase tracking-[0.18em] text-white/30">
          v0.8 ACTIVE · LCS LINE-LEVEL DIFF · FETCH SERVER-SIDE
        </p>
      </div>
    </HubShell>
  );
}
