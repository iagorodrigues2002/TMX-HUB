import { AdsIntelligenceCenter } from '@/components/ads-intelligence/ads-intelligence-center';
import { ToolGuard } from '@/components/auth/tool-guard';
import { HubShell } from '@/components/hub/hub-shell';
import { creativeWorkspaceEnabled } from '@/lib/creative-workspace-release';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function AdsIntelligencePage() {
  if (creativeWorkspaceEnabled)
    redirect('/trafego?view=ads-intelligence');
  return (
    <HubShell breadcrumb={['Ofertas', 'Ads Intelligence']}>
      <ToolGuard tool="ofertas">
        <AdsIntelligenceCenter />
      </ToolGuard>
    </HubShell>
  );
}
