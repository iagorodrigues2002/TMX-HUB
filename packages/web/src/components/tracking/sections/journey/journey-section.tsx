'use client';

import {
  TrackingSectionContent,
  type TrackingSectionId,
} from '@/components/tracking/sections/journey/tracking-section-content';

const JOURNEY_SECTION: Record<string, TrackingSectionId> = {
  live: 'tracker',
  funnel: 'funnel',
  attribution: 'attribution',
  upsells: 'upsells',
  'entry-links': 'links',
  'ab-tests': 'ab',
};

export function JourneySection({
  offerId,
  canManage,
  section,
}: { offerId: string; canManage: boolean; section: string }) {
  return (
    <TrackingSectionContent
      offerId={offerId}
      canManage={canManage}
      section={JOURNEY_SECTION[section] ?? 'tracker'}
    />
  );
}
