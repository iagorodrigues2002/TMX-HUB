'use client';

import { ToolGuard } from '@/components/auth/tool-guard';
import { HubShell } from '@/components/hub/hub-shell';
import { TrackingWorkspace } from '@/components/tracking/tracking-workspace';

export const dynamic = 'force-dynamic';

export default function TrackingPage() {
  return (
    <HubShell breadcrumb={['TRACKEAMENTO AVANÇADO']}>
      <ToolGuard tool="ofertas">
        <TrackingWorkspace />
      </ToolGuard>
    </HubShell>
  );
}
