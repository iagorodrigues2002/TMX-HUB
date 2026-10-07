'use client';

import {
  DestinationShell,
  destinationLegacyContentClassName,
} from '@/components/tracking/sections/destinations/destination-shell';
import { NetworkTrackingCard } from '@/components/tracking/sections/destinations/network-tracking-card';
import { TikTokDestinations } from '@/components/tracking/tiktok-destinations';

export function TikTokSection({ offerId }: { offerId: string }) {
  return (
    <DestinationShell
      title="TikTok Ads"
      description="Pixels e Events API independentes por oferta, com teste sem depender de uma venda real."
      contentClassName={destinationLegacyContentClassName}
    >
      <NetworkTrackingCard className="mb-5" network="tiktok" />
      <TikTokDestinations key={offerId} offerId={offerId} />
    </DestinationShell>
  );
}
