'use client';

import {
  TrackingSectionContent,
  type TrackingSectionId,
} from '@/components/tracking/sections/journey/tracking-section-content';

const DESTINATION_SECTION: Record<string, TrackingSectionId> = {
  meta: 'meta',
  'tiktok-ads': 'tiktok',
  utmify: 'utmify',
  'google-ads': 'google',
  pushcut: 'pushcut',
};

export function DestinationsSection({
  offerId,
  canManage,
  section,
}: { offerId: string; canManage: boolean; section: string }) {
  return (
    <TrackingSectionContent
      offerId={offerId}
      canManage={canManage}
      section={DESTINATION_SECTION[section] ?? 'meta'}
    />
  );
}
