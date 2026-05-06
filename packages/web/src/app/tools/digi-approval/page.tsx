import { ClipboardCheck } from 'lucide-react';
import { HubShell } from '@/components/hub/hub-shell';
import { AuditList } from '@/components/digi/audit-list';

export const dynamic = 'force-dynamic';

export default function DigiApprovalIndexPage() {
  return (
    <HubShell breadcrumb={['TOOLS', 'DIGI APPROVAL']}>
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 space-y-3 text-center">
          <div
            className="mx-auto grid h-14 w-14 place-items-center rounded-md border border-cyan-300/30"
            style={{
              background:
                'linear-gradient(135deg, rgba(20,184,166,0.18), rgba(34,211,238,0.05))',
            }}
          >
            <ClipboardCheck className="h-6 w-6 text-cyan-300" />
          </div>
          <p className="hud-label">Module 010 — Digistore24 Approval</p>
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Auditoria de cadastro de produto na Digi
          </h1>
          <p className="mx-auto max-w-2xl text-[14px] text-white/55">
            Walk-through estruturado em 12 seções (~120 itens, ~50 críticos) consolidando o
            playbook Blackzada + CloakUp. Cada produto tem sua auditoria persistente — abre,
            checa, anota, fecha. Bandeiras vermelhas sempre visíveis no detalhe.
          </p>
        </header>

        <AuditList />

        <p className="mt-8 text-center text-[10px] uppercase tracking-[0.18em] text-white/30">
          v0.1 · base: digistore24-expertise + checklist Blackzada + CloakUp
        </p>
      </div>
    </HubShell>
  );
}
