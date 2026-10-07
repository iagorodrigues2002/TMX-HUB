'use client';

import { CaptureSection } from '@/components/tracking/sections/capture/capture-section';
import { DestinationsSection } from '@/components/tracking/sections/destinations/destinations-section';
import { FinanceSection } from '@/components/tracking/sections/finance/finance-section';
import { JourneySection } from '@/components/tracking/sections/journey/journey-section';
import { OverviewSection } from '@/components/tracking/sections/overview/overview-section';
import type { TrackingView } from '@/components/tracking/tracking-nav';

interface TrackingAdvancedCenterProps {
  offerId: string;
  canManage: boolean;
  view: TrackingView;
  section: string;
}

export function TrackingAdvancedCenter({
  offerId,
  canManage,
  view,
  section,
}: TrackingAdvancedCenterProps) {
  const shared = { offerId, canManage, section };

  switch (view) {
    case 'overview':
      return <OverviewSection {...shared} />;
    case 'journey':
      return <JourneySection {...shared} />;
    case 'capture':
      return <CaptureSection {...shared} />;
    case 'destinations':
      return <DestinationsSection {...shared} />;
    case 'finance':
      return <FinanceSection {...shared} />;
  }
}
