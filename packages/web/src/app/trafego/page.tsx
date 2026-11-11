import { HubShell } from '@/components/hub/hub-shell';
import { TrafficPreview } from '@/components/traffic/traffic-preview';

export const dynamic = 'force-dynamic';

export default function TrafficPage() {
  return (
    <HubShell
      breadcrumb={['TRÁFEGO']}
      previewNotice={
        process.env.NEXT_PUBLIC_TMX_LOCAL_PREVIEW_KIND === 'synthetic'
          ? 'Prévia local · sem publicação ou alterações em produção.'
          : undefined
      }
    >
      <TrafficPreview />
    </HubShell>
  );
}
