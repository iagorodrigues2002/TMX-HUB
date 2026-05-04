import { HubShell } from '@/components/hub/hub-shell';
import { SettingsClient } from '@/components/settings/settings-client';

export const dynamic = 'force-dynamic';

export default function SettingsPage() {
  return (
    <HubShell breadcrumb={['CONFIGURAÇÕES']}>
      <SettingsClient />
    </HubShell>
  );
}
