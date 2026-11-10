import { HubShell } from '@/components/hub/hub-shell';
import { SpyAllAds } from '@/components/spy/spy-all-ads';
export const dynamic = 'force-dynamic';
export default function SpyAdsPage() {
  return (
    <HubShell breadcrumb={['SPY', 'Anúncios']}>
      <SpyAllAds />
    </HubShell>
  );
}
