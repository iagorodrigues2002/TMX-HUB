'use client';

import { TrackingRefundsSummary } from '@/components/tracking/refunds-dashboard';
import { DiagnosticsSection } from '@/components/tracking/sections/diagnostics/diagnostics-section';
import { GatewaysSection } from '@/components/tracking/sections/finance/gateways-section';
import {
  TrackingSectionContent,
  type TrackingSectionId,
} from '@/components/tracking/sections/journey/tracking-section-content';

const FINANCE_SECTION: Record<string, TrackingSectionId> = {
  payments: 'gateways',
  fees: 'fees',
};

export function FinanceSection({
  offerId,
  canManage,
  section,
}: { offerId: string; canManage: boolean; section: string }) {
  if (section === 'refunds') {
    return <TrackingRefundsSummary offerId={offerId} />;
  }
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
