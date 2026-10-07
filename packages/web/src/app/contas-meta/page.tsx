import { ToolGuard } from '@/components/auth/tool-guard';
import { HubShell } from '@/components/hub/hub-shell';
import { MetaAccountsControl } from '@/components/meta-control/meta-accounts-control';
import { SHOW_META_CONTROL } from '@/lib/ui-visibility';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function MetaAccountsPage() {
  if (!SHOW_META_CONTROL) notFound();

  return (
    <HubShell breadcrumb={['CONTROLE DE CONTAS']}>
      <ToolGuard tool="ofertas">
        <MetaAccountsControl />
      </ToolGuard>
    </HubShell>
  );
}
