import { HubShell } from '@/components/hub/hub-shell';
import { RecoveryCenter } from '@/components/recovery/recovery-center';

export default function RecoveryPage() {
  return <HubShell breadcrumb={['RECOVERY']}><RecoveryCenter /></HubShell>;
}
