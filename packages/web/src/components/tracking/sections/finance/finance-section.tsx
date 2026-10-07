'use client';

import { GatewaysSection } from '@/components/tracking/sections/finance/gateways-section';
import {
  TrackingSectionContent,
  type TrackingSectionId,
} from '@/components/tracking/sections/journey/tracking-section-content';
import { DataState } from '@/components/ui/data-state';
import dynamic from 'next/dynamic';

const DiagnosticsSection = dynamic(
  () =>
    import('@/components/tracking/sections/diagnostics/diagnostics-section').then(
      (module) => module.DiagnosticsSection,
    ),
  { loading: () => <DataState variant="loading" title="Carregando diagnóstico…" /> },
);

const FINANCE_SECTION: Record<string, TrackingSectionId> = {
  payments: 'gateways',
  fees: 'fees',
};

export function FinanceSection({
  offerId,
  canManage,
  section,
}: { offerId: string; canManage: boolean; section: string }) {
  if (section === 'health' || section === 'console' || section === 'help') {
    return <DiagnosticsSection offerId={offerId} canManage={canManage} section={section} />;
  }
  if (section === 'payments') {
    return <GatewaysSection offerId={offerId} canManage={canManage} />;
  }
  return (
    <TrackingSectionContent
      offerId={offerId}
      canManage={canManage}
      section={FINANCE_SECTION[section] ?? 'gateways'}
    />
  );
}
