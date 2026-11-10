import { HubShell } from '@/components/hub/hub-shell';
import { SpyPreview } from '@/components/spy/spy-preview';
export const dynamic = 'force-dynamic';
export default function SpyPage() {
  return (
    <HubShell breadcrumb={['SPY']}>
      <SpyPreview />
    </HubShell>
  );
}
