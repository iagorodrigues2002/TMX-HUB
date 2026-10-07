'use client';

import { ToolGuard } from '@/components/auth/tool-guard';
import { HubShell } from '@/components/hub/hub-shell';
import { UtmifyGlobalCenter } from '@/components/utmify/utmify-global-center';

export const dynamic = 'force-dynamic';

export default function UtmifyGlobalPage() {
  return (
    <HubShell breadcrumb={['INTEGRAÇÕES', 'UTMIFY GLOBAL']}>
      <ToolGuard tool="ofertas">
        <UtmifyGlobalCenter />
      </ToolGuard>
    </HubShell>
  );
}
