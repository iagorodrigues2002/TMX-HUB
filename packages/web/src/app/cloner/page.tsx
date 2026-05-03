import { Layers } from 'lucide-react';
import { HubShell } from '@/components/hub/hub-shell';
import { UrlInputForm } from '@/components/url-input-form';

export default function ClonerPage() {
  return (
    <HubShell breadcrumb={['CLONER']}>
      <div className="mx-auto max-w-2xl">
        <header className="mb-8 space-y-3 text-center">
          <div
            className="mx-auto grid h-14 w-14 place-items-center rounded-md border border-cyan-300/30"
            style={{
              background:
                'linear-gradient(135deg, rgba(20,184,166,0.18), rgba(34,211,238,0.05))',
            }}
          >
            <Layers className="h-6 w-6 text-cyan-300" />
          </div>
          <p className="hud-label">Module 001 — Page Cloner</p>
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Clone uma página pública
          </h1>
          <p className="text-[14px] text-white/55">
            Cole uma URL, sanitize a página e gere um HTML portátil ou ZIP.
          </p>
        </header>

        <div className="glass-card p-8">
          <UrlInputForm />
        </div>

        <p className="mt-6 text-center text-[10px] uppercase tracking-[0.18em] text-white/30">
          v0.1 ACTIVE · APENAS URLs PÚBLICAS · SCRIPTS REMOVIDOS AUTOMATICAMENTE
        </p>
      </div>
    </HubShell>
  );
}
