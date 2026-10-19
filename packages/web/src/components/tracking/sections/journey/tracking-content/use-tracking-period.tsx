'use client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { saoPauloDateOffset } from './tracking-helpers';
import type { useFormState } from './use-form-state';
export function useTrackingPeriod({
  trackingFrom,
  trackingTo,
  setIsRefreshingTracking,
  offerId,
}: {
  trackingFrom: ReturnType<typeof useFormState>['trackingFrom'];
  trackingTo: ReturnType<typeof useFormState>['trackingTo'];
  setIsRefreshingTracking: ReturnType<typeof useFormState>['setIsRefreshingTracking'];
  offerId: string;
}) {
  const datePresets = [
    { label: 'Hoje', from: saoPauloDateOffset(0), to: saoPauloDateOffset(0) },
    { label: 'Ontem', from: saoPauloDateOffset(1), to: saoPauloDateOffset(1) },
    { label: 'Anteontem', from: saoPauloDateOffset(2), to: saoPauloDateOffset(2) },
    { label: '7 dias', from: saoPauloDateOffset(6), to: saoPauloDateOffset(0) },
    { label: '30 dias', from: saoPauloDateOffset(29), to: saoPauloDateOffset(0) },
  ];

  const trackingPeriod = { from: trackingFrom, to: trackingTo };

  const qc = useQueryClient();

  const refreshTracking = async () => {
    setIsRefreshingTracking(true);
    try {
      await Promise.all(
        [
          'tracking-summary',
          'tracking-events',
          'tracking-orders',
          'tracking-page-funnel',
          'tracking-journeys',
          'tracking-attribution',
          'tracking-countries',
          'tracking-ab-metrics',
        ].map((key) => qc.invalidateQueries({ queryKey: [key, offerId] })),
      );
      toast.success('Dados do período atualizados.');
    } finally {
      setIsRefreshingTracking(false);
    }
  };
  return { datePresets, trackingPeriod, qc, refreshTracking };
}
