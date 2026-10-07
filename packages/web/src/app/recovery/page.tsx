import { HubShell } from '@/components/hub/hub-shell';
import { RecoveryCenter } from '@/components/recovery/recovery-center';
import { SHOW_RECOVERY } from '@/lib/ui-visibility';
import { notFound } from 'next/navigation';

export default function RecoveryPage() {
  if (!SHOW_RECOVERY) notFound();

  return (
    <HubShell breadcrumb={['RECOVERY']}>
      <RecoveryCenter />
    </HubShell>
  );
}
