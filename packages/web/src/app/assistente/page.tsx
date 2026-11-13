import { HubShell } from '@/components/hub/hub-shell';
import { AiAssistant } from '@/components/traffic/ai-assistant';
export const dynamic = 'force-dynamic';
export default function Page() {
  return (
    <HubShell fullBleed breadcrumb={['ASSISTENTE']}>
      <AiAssistant />
    </HubShell>
  );
}
