import { HubShell } from '@/components/hub/hub-shell';
import { TrackingHelp } from '@/components/tracking/tracking-help';
import { BookOpenCheck } from 'lucide-react';

export default function TrackingVendepayHelpPage() {
  return (
    <HubShell breadcrumb={['AJUDA', 'TRACKING VENDEPAY']}>
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 space-y-3">
          <div className="grid h-12 w-12 place-items-center rounded-md border border-cyan-300/25 bg-cyan-300/[0.06]">
            <BookOpenCheck className="h-5 w-5 text-cyan-300" />
          </div>
          <p className="hud-label">Central de ajuda · Tracking avançado</p>
          <h1 className="max-w-3xl text-3xl font-bold tracking-tight text-white md:text-4xl">
            Configurar e testar o tracking Vendepay
          </h1>
          <p className="max-w-3xl text-sm leading-6 text-white/55">
            Da infraestrutura no Railway até a primeira venda atribuída: siga o roteiro abaixo na
            ordem e valide cada etapa antes de avançar.
          </p>
        </header>

        <TrackingHelp />
      </div>
    </HubShell>
  );
}
