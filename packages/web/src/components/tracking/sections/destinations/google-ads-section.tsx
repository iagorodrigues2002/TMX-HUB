'use client';

import { GoogleAdsDestinations } from '@/components/tracking/google-ads-destinations';
import {
  DestinationShell,
  destinationLegacyContentClassName,
} from '@/components/tracking/sections/destinations/destination-shell';

export function GoogleAdsSection({ offerId }: { offerId: string }) {
  return (
    <DestinationShell
      title="Google Ads"
      description="Contas e ações de conversão independentes por oferta, com autorização e validação técnica no mesmo fluxo."
      contentClassName={destinationLegacyContentClassName}
    >
      <GoogleAdsDestinations key={offerId} offerId={offerId} />
    </DestinationShell>
  );
}
