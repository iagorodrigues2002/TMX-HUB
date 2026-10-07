import { ToolGuard } from '@/components/auth/tool-guard';
import { HubShell } from '@/components/hub/hub-shell';
import { RefundsDashboard } from '@/components/tracking/refunds-dashboard';

export const dynamic = 'force-dynamic';
export default async function RefundsPage({
  searchParams,
}: {
  searchParams: Promise<{ offer?: string | string[] }>;
}) {
  const params = await searchParams;
  const initialOfferId = typeof params.offer === 'string' ? params.offer : '';

  return (
    <HubShell breadcrumb={['FINANCEIRO', 'REEMBOLSOS E CHARGEBACKS']}>
      <ToolGuard tool="ofertas">
        <RefundsDashboard initialOfferId={initialOfferId} />
      </ToolGuard>
    </HubShell>
  );
}
