'use client';

import { ToolGuard } from '@/components/auth/tool-guard';
import { HubShell } from '@/components/hub/hub-shell';
import { AdsIntelligenceCenter } from '@/components/ads-intelligence/ads-intelligence-center';

export const dynamic = 'force-dynamic';

export default function AdsIntelligencePage() {
  return <HubShell breadcrumb={['Ofertas', 'Ads Intelligence']}>
    <ToolGuard tool="ofertas"><AdsIntelligenceCenter /></ToolGuard>
  </HubShell>;
}
