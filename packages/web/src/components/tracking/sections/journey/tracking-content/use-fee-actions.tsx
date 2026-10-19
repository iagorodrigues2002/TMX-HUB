'use client';
import { TRACKING_DASHBOARD_STALE_TIME } from '@/components/tracking/tracking-query';
import { apiClient } from '@/lib/api-client';
import { useQuery } from '@tanstack/react-query';
import { useMutation } from '@tanstack/react-query';
import { useEffect } from 'react';
import { toast } from 'sonner';
import type { TrackingSectionId } from './tracking-navigation';
import type { useFormState } from './use-form-state';
import type { useTrackingPeriod } from './use-tracking-period';
export function useFeeActions({
  offerId,
  trackingFrom,
  trackingTo,
  trackingPeriod,
  section,
  setFeeVendepayPct,
  setFeeExtraAmount,
  setFeeExtraCurrency,
  setFeeReservePct,
  setFeeReserveDays,
  setFeePayoutDays,
  feeVendepayPct,
  feeExtraAmount,
  feeExtraCurrency,
  feeReservePct,
  feeReserveDays,
  feePayoutDays,
  qc,
}: {
  offerId: string;
  trackingFrom: ReturnType<typeof useFormState>['trackingFrom'];
  trackingTo: ReturnType<typeof useFormState>['trackingTo'];
  trackingPeriod: ReturnType<typeof useTrackingPeriod>['trackingPeriod'];
  section: TrackingSectionId;
  setFeeVendepayPct: ReturnType<typeof useFormState>['setFeeVendepayPct'];
  setFeeExtraAmount: ReturnType<typeof useFormState>['setFeeExtraAmount'];
  setFeeExtraCurrency: ReturnType<typeof useFormState>['setFeeExtraCurrency'];
  setFeeReservePct: ReturnType<typeof useFormState>['setFeeReservePct'];
  setFeeReserveDays: ReturnType<typeof useFormState>['setFeeReserveDays'];
  setFeePayoutDays: ReturnType<typeof useFormState>['setFeePayoutDays'];
  feeVendepayPct: ReturnType<typeof useFormState>['feeVendepayPct'];
  feeExtraAmount: ReturnType<typeof useFormState>['feeExtraAmount'];
  feeExtraCurrency: ReturnType<typeof useFormState>['feeExtraCurrency'];
  feeReservePct: ReturnType<typeof useFormState>['feeReservePct'];
  feeReserveDays: ReturnType<typeof useFormState>['feeReserveDays'];
  feePayoutDays: ReturnType<typeof useFormState>['feePayoutDays'];
  qc: ReturnType<typeof useTrackingPeriod>['qc'];
}) {
  const refunds = useQuery({
    queryKey: ['tracking-refunds', offerId, trackingFrom, trackingTo],
    queryFn: () => apiClient.getTrackingRefunds(offerId, trackingPeriod),
    enabled: section === 'refunds',
    retry: false,
    staleTime: TRACKING_DASHBOARD_STALE_TIME,
  });

  const feeSettings = useQuery({
    queryKey: ['tracking-fee-settings', offerId],
    queryFn: () => apiClient.getTrackingFeeSettings(offerId),
    enabled: section === 'fees',
    retry: false,
    staleTime: TRACKING_DASHBOARD_STALE_TIME,
  });

  useEffect(() => {
    if (!feeSettings.data) return;
    setFeeVendepayPct(String(feeSettings.data.vendepay_fee_pct));
    setFeeExtraAmount((feeSettings.data.extra_fee_minor / 100).toFixed(2));
    setFeeExtraCurrency(feeSettings.data.extra_fee_currency);
    setFeeReservePct(String(feeSettings.data.reserve_pct));
    setFeeReserveDays(String(feeSettings.data.reserve_days));
    setFeePayoutDays(String(feeSettings.data.payout_days));
  }, [
    feeSettings.data,
    setFeeVendepayPct,
    setFeeExtraAmount,
    setFeeExtraCurrency,
    setFeeReservePct,
    setFeeReserveDays,
    setFeePayoutDays,
  ]);

  const saveFeeSettings = useMutation({
    mutationFn: () =>
      apiClient.updateTrackingFeeSettings(offerId, {
        vendepay_fee_pct: Number(feeVendepayPct.replace(',', '.')),
        extra_fee_minor: Math.round(Number(feeExtraAmount.replace(',', '.')) * 100),
        extra_fee_currency: feeExtraCurrency,
        reserve_pct: Number(feeReservePct.replace(',', '.')),
        reserve_days: Number(feeReserveDays),
        payout_days: Number(feePayoutDays),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tracking-fee-settings', offerId] });
      void qc.invalidateQueries({ queryKey: ['tracking-summary', offerId] });
      toast.success('Taxas salvas. O líquido já reflete os novos valores.');
    },
    onError: (error) => toast.error((error as Error).message),
  });
  return { refunds, feeSettings, saveFeeSettings };
}
