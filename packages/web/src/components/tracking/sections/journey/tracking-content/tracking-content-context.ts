import type { TrackingSectionId } from './tracking-navigation';
import type { useDestinationQueries } from './use-destination-queries';
import type { useDomainActions } from './use-domain-actions';
import type { useEntryLinkActions } from './use-entry-link-actions';
import type { useFeeActions } from './use-fee-actions';
import type { useFormState } from './use-form-state';
import type { useGatewayActions } from './use-gateway-actions';
import type { useProductActions } from './use-product-actions';
import type { usePushcutActions } from './use-pushcut-actions';
import type { useSetupStatus } from './use-setup-status';
import type { useTrackingPeriod } from './use-tracking-period';
import type { useUpsellActions } from './use-upsell-actions';
import type { useUpsellQueries } from './use-upsell-queries';
import type { useUtmifyActions } from './use-utmify-actions';
import type { useVendepayActions } from './use-vendepay-actions';
export type TrackingContentContext = {
  offerId: string;
  canManage: boolean;
  section: TrackingSectionId;
} & ReturnType<typeof useFormState> &
  ReturnType<typeof useTrackingPeriod> &
  ReturnType<typeof useUpsellQueries> &
  ReturnType<typeof useUpsellActions> &
  ReturnType<typeof useDomainActions> &
  ReturnType<typeof useEntryLinkActions> &
  ReturnType<typeof useDestinationQueries> &
  ReturnType<typeof useUtmifyActions> &
  ReturnType<typeof useProductActions> &
  ReturnType<typeof usePushcutActions> &
  ReturnType<typeof useFeeActions> &
  ReturnType<typeof useGatewayActions> &
  ReturnType<typeof useVendepayActions> &
  ReturnType<typeof useSetupStatus>;
