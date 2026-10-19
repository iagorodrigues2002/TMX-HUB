'use client';
import { TRACKING_DASHBOARD_STALE_TIME } from '@/components/tracking/tracking-query';
import { apiClient } from '@/lib/api-client';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { upsellStageLabel } from './tracking-helpers';
import { UPSELL_STAGE_OPTIONS } from './tracking-helpers';
import { ADVANCED_QUERY_SECTIONS } from './tracking-navigation';
import type { TrackingSectionId } from './tracking-navigation';
import type { useFormState } from './use-form-state';
export function useUpsellQueries({
  offerId,
  section,
  trackingFrom,
  trackingTo,
  upsellIdentityOffset,
  upsellIdentityPageSize,
  setUpsellIdentityOffset,
  upsellBuyerFilter,
  upsellTestFilter,
  editingUpsellStageId,
  upsellStageKey,
  setUpsellStageKey,
  setUpsellStageName,
}: {
  offerId: string;
  section: TrackingSectionId;
  trackingFrom: ReturnType<typeof useFormState>['trackingFrom'];
  trackingTo: ReturnType<typeof useFormState>['trackingTo'];
  upsellIdentityOffset: ReturnType<typeof useFormState>['upsellIdentityOffset'];
  upsellIdentityPageSize: number;
  setUpsellIdentityOffset: ReturnType<typeof useFormState>['setUpsellIdentityOffset'];
  upsellBuyerFilter: ReturnType<typeof useFormState>['upsellBuyerFilter'];
  upsellTestFilter: ReturnType<typeof useFormState>['upsellTestFilter'];
  editingUpsellStageId: ReturnType<typeof useFormState>['editingUpsellStageId'];
  upsellStageKey: ReturnType<typeof useFormState>['upsellStageKey'];
  setUpsellStageKey: ReturnType<typeof useFormState>['setUpsellStageKey'];
  setUpsellStageName: ReturnType<typeof useFormState>['setUpsellStageName'];
}) {
  // TODO: replace the shared advanced payload with section-specific API endpoints.
  const advanced = useQuery({
    queryKey: ['tracking-advanced', offerId, section],
    queryFn: () => apiClient.getAdvancedTracking(offerId),
    enabled: ADVANCED_QUERY_SECTIONS.has(section),
    retry: false,
    staleTime: TRACKING_DASHBOARD_STALE_TIME,
  });

  const upsellIntelligence = useQuery({
    queryKey: ['tracking-upsells', offerId, trackingFrom, trackingTo],
    queryFn: () => apiClient.getTrackingUpsells(offerId, { from: trackingFrom, to: trackingTo }),
    enabled: section === 'upsells',
    retry: false,
    staleTime: TRACKING_DASHBOARD_STALE_TIME,
    refetchOnWindowFocus: false,
  });

  const upsellIdentities = useQuery({
    queryKey: [
      'tracking-upsell-identities',
      offerId,
      'all',
      upsellIdentityOffset,
      upsellIdentityPageSize,
    ],
    queryFn: () =>
      apiClient.getTrackingUpsellIdentities(offerId, {
        all: true,
        limit: upsellIdentityPageSize,
        offset: upsellIdentityOffset,
      }),
    enabled: section === 'upsells',
    placeholderData: (previous, query) => (query?.queryKey[1] === offerId ? previous : undefined),
    retry: false,
    staleTime: TRACKING_DASHBOARD_STALE_TIME,
    refetchOnWindowFocus: false,
    refetchInterval: section === 'upsells' ? 15_000 : false,
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset pagination when the offer changes.
  useEffect(() => {
    setUpsellIdentityOffset(0);
  }, [offerId]);

  const filteredUpsellIdentities = (upsellIdentities.data?.items ?? []).filter((identity) => {
    if (upsellBuyerFilter === 'front_only' && identity.has_upsell) return false;
    if (upsellBuyerFilter === 'with_upsell' && !identity.has_upsell) return false;
    const results = identity.links.map((link) => link.manual_result);
    const hasWorked = results.includes('worked');
    const hasFailed = results.includes('failed');
    if (upsellTestFilter === 'worked') return hasWorked;
    if (upsellTestFilter === 'failed') return hasFailed && !hasWorked;
    if (upsellTestFilter === 'unclassified') return !hasWorked && !hasFailed;
    return true;
  });

  const configuredUpsellStages = new Set(
    (upsellIntelligence.data?.stages ?? []).map((stage) => stage.stage_key),
  );

  useEffect(() => {
    const configuredStageKeys = new Set(
      (upsellIntelligence.data?.stages ?? []).map((stage) => stage.stage_key),
    );
    if (
      editingUpsellStageId ||
      !upsellIntelligence.data ||
      !configuredStageKeys.has(upsellStageKey)
    )
      return;
    const next = UPSELL_STAGE_OPTIONS.find((stage) => !configuredStageKeys.has(stage));
    if (!next) return;
    setUpsellStageKey(next);
    setUpsellStageName(upsellStageLabel(next));
  }, [
    editingUpsellStageId,
    upsellIntelligence.data,
    upsellStageKey,
    setUpsellStageKey,
    setUpsellStageName,
  ]);
  return {
    advanced,
    upsellIntelligence,
    upsellIdentities,
    filteredUpsellIdentities,
    configuredUpsellStages,
  };
}
