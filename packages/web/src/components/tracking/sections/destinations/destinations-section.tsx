'use client';

import { GoogleAdsSection } from '@/components/tracking/sections/destinations/google-ads-section';
import { MetaPixelsPanel } from '@/components/tracking/sections/destinations/meta-pixels-panel';
import { TikTokSection } from '@/components/tracking/sections/destinations/tiktok-section';
import {
  TrackingSectionContent,
  type TrackingSectionId,
} from '@/components/tracking/sections/journey/tracking-section-content';

const DESTINATION_SECTION: Record<string, TrackingSectionId> = {
  meta: 'meta',
  'tiktok-ads': 'tiktok-ads',
  utmify: 'utmify',
  'google-ads': 'google-ads',
  vturb: 'vturb',
  pushcut: 'pushcut',
};

export function DestinationsSection({
  offerId,
  canManage,
  section,
}: { offerId: string; canManage: boolean; section: string }) {
  return (
    <div className="space-y-5">
      {section === 'meta' && <MetaPixelsPanel offerId={offerId} canManage={canManage} />}
      {section === 'google-ads' ? (
        <GoogleAdsSection offerId={offerId} />
      ) : section === 'tiktok-ads' ? (
        <TikTokSection offerId={offerId} />
      ) : (
        <TrackingSectionContent
          offerId={offerId}
          canManage={canManage}
          section={DESTINATION_SECTION[section] ?? 'meta'}
        />
      )}
    </div>
  );
}
