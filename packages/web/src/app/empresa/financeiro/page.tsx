import { ToolGuard } from '@/components/auth/tool-guard';
import { HubShell } from '@/components/hub/hub-shell';
import { FinanceDashboardPreview } from '@/components/overview/finance-dashboard-preview';

export default function FinancePage() {
  return (
    <HubShell breadcrumb={['Empresa', 'Financeiro']}>
      <ToolGuard tool="ofertas">
        <FinanceDashboardPreview />
      </ToolGuard>
    </HubShell>
  );
}
