'use client';

import { ToolGuard } from '@/components/auth/tool-guard';
import { HubShell } from '@/components/hub/hub-shell';
import { SyzepayInbox } from '@/components/tracking/syzepay-inbox';

export default function SyzepayPage() {
  return (
    <HubShell breadcrumb={['Integrações', 'SyzePay por empresa']}>
      <ToolGuard tool="ofertas">
        <SyzepayInbox />
      </ToolGuard>
    </HubShell>
  );
}
