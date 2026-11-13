import { HubShell } from '@/components/hub/hub-shell';
import { AiSettings } from '@/components/traffic/ai-assistant';
export const dynamic = 'force-dynamic';
export default function Page() {
  return (
    <HubShell breadcrumb={['ADMIN', 'IA']}>
      <AiSettings />
    </HubShell>
  );
}
