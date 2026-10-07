'use client';

import type { TrackingView } from '@/components/tracking/tracking-nav';
import { DataState } from '@/components/ui/data-state';
import dynamic from 'next/dynamic';

function SectionLoading() {
  return <DataState variant="loading" title="Carregando seção…" />;
}

const OverviewSection = dynamic(
  () =>
    import('@/components/tracking/sections/overview/overview-section').then(
      (module) => module.OverviewSection,
    ),
  { loading: SectionLoading },
);
const JourneySection = dynamic(
  () =>
    import('@/components/tracking/sections/journey/journey-section').then(
      (module) => module.JourneySection,
    ),
  { loading: SectionLoading },
);
const CaptureSection = dynamic(
  () =>
    import('@/components/tracking/sections/capture/capture-section').then(
      (module) => module.CaptureSection,
    ),
  { loading: SectionLoading },
);
const DestinationsSection = dynamic(
  () =>
    import('@/components/tracking/sections/destinations/destinations-section').then(
      (module) => module.DestinationsSection,
    ),
  { loading: SectionLoading },
);
const FinanceSection = dynamic(
  () =>
    import('@/components/tracking/sections/finance/finance-section').then(
      (module) => module.FinanceSection,
    ),
  { loading: SectionLoading },
);

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
    case 'upsell-intelligence':
      return <JourneySection {...shared} section="upsells" />;
    case 'capture':
      return <CaptureSection {...shared} />;
    case 'destinations':
      return <DestinationsSection {...shared} />;
    case 'finance':
      return <FinanceSection {...shared} />;
  }
}
