import { ToolGuard } from '@/components/auth/tool-guard';
import { HubShell } from '@/components/hub/hub-shell';
import { RefundsDashboard } from '@/components/tracking/refunds-dashboard';

export const dynamic = 'force-dynamic';
export default function RefundsPage() {
  return (
    <HubShell breadcrumb={['Empresa', 'Financeiro', 'Reembolsos e chargebacks']}>
      <ToolGuard tool="ofertas">
        <RefundsDashboard />
      </ToolGuard>
    </HubShell>
  );
}
