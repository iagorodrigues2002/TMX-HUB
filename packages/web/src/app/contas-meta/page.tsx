'use client';

import { ToolGuard } from '@/components/auth/tool-guard';
import { HubShell } from '@/components/hub/hub-shell';
import { MetaAccountsControl } from '@/components/meta-control/meta-accounts-control';

export const dynamic = 'force-dynamic';

export default function MetaAccountsPage() {
  return (
    <HubShell breadcrumb={['CONTROLE DE CONTAS']}>
      <ToolGuard tool="ofertas">
        <MetaAccountsControl />
      </ToolGuard>
    </HubShell>
  );
}
