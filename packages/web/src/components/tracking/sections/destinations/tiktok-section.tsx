'use client';

import {
  DestinationShell,
  destinationLegacyContentClassName,
} from '@/components/tracking/sections/destinations/destination-shell';
import { TikTokDestinations } from '@/components/tracking/tiktok-destinations';

export function TikTokSection({ offerId }: { offerId: string }) {
  return (
    <DestinationShell
      title="TikTok Ads"
      description="Pixels e Events API independentes por oferta, com teste sem depender de uma venda real."
      contentClassName={destinationLegacyContentClassName}
    >
      <TikTokDestinations key={offerId} offerId={offerId} />
    </DestinationShell>
  );
}
