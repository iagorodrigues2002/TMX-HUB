'use client';
import { TRACKING_DASHBOARD_STALE_TIME } from '@/components/tracking/tracking-query';
import { apiClient } from '@/lib/api-client';
import { useQuery } from '@tanstack/react-query';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CONFIG_QUERY_SECTIONS } from './tracking-navigation';
import type { TrackingSectionId } from './tracking-navigation';
import type { useFormState } from './use-form-state';
import type { useTrackingPeriod } from './use-tracking-period';
export function useDestinationQueries({
  offerId,
  section,
  setVendepayWebhook,
  qc,
  setSection,
  trackingFrom,
  trackingTo,
  trackingPeriod,
}: {
  offerId: string;
  section: TrackingSectionId;
  setVendepayWebhook: ReturnType<typeof useFormState>['setVendepayWebhook'];
  qc: ReturnType<typeof useTrackingPeriod>['qc'];
  setSection: ReturnType<typeof useFormState>['setSection'];
  trackingFrom: ReturnType<typeof useFormState>['trackingFrom'];
  trackingTo: ReturnType<typeof useFormState>['trackingTo'];
  trackingPeriod: ReturnType<typeof useTrackingPeriod>['trackingPeriod'];
}) {
  const config = useQuery({
    queryKey: ['tracking-config', offerId],
    queryFn: () => apiClient.getTrackingConfig(offerId),
    enabled: CONFIG_QUERY_SECTIONS.has(section),
    retry: false,
    staleTime: TRACKING_DASHBOARD_STALE_TIME,
  });

  const setupTracking = useMutation({
    mutationFn: () => apiClient.setupTracking(offerId),
    onSuccess: (result) => {
      if (result.vendepay_webhook_url) setVendepayWebhook(result.vendepay_webhook_url);
      void qc.invalidateQueries({ queryKey: ['tracking-config', offerId] });
      setSection('gateways');
      toast.success(
        result.vendepay_webhook_url
          ? 'Tracking ativado. Copie agora o webhook da Vendepay.'
          : 'Tracking desta oferta já está ativo.',
      );
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const utmify = useQuery({
    queryKey: ['tracking-utmify-destination', offerId],
    queryFn: () => apiClient.getTrackingUtmifyDestination(offerId),
    enabled: section === 'utmify',
    retry: false,
    staleTime: TRACKING_DASHBOARD_STALE_TIME,
  });

  const utmifyPixel = useQuery({
    queryKey: ['tracking-utmify-pixel', offerId],
    queryFn: () => apiClient.getTrackingUtmifyPixel(offerId),
    enabled: section === 'utmify',
    retry: false,
    staleTime: TRACKING_DASHBOARD_STALE_TIME,
  });

  const metaPixels = useQuery({
    queryKey: ['tracking-meta-pixels', offerId],
    queryFn: () => apiClient.listMetaPixels(offerId),
    enabled: section === 'meta' && Boolean(config.data?.configured),
    retry: false,
    staleTime: TRACKING_DASHBOARD_STALE_TIME,
  });

  const tiktokDestinations = useQuery({
    queryKey: ['tiktok-destinations', offerId],
    queryFn: () => apiClient.tiktokDestinations(offerId),
    enabled: section === 'tiktok-ads' && Boolean(config.data?.configured),
    retry: false,
    staleTime: TRACKING_DASHBOARD_STALE_TIME,
  });

  const utmifyWebEvents = useQuery({
    queryKey: ['tracking-utmify-web-events', offerId, trackingFrom, trackingTo],
    queryFn: () => apiClient.listTrackingUtmifyWebEvents(offerId, trackingPeriod),
    enabled: section === 'utmify',
    refetchInterval: 30_000,
    retry: false,
    staleTime: TRACKING_DASHBOARD_STALE_TIME,
  });

  const utmifyDeliveries = useQuery({
    queryKey: ['tracking-utmify-deliveries', offerId],
    queryFn: () => apiClient.listTrackingUtmifyDeliveries(offerId),
    enabled: section === 'utmify',
    refetchInterval: 30_000,
    retry: false,
    staleTime: TRACKING_DASHBOARD_STALE_TIME,
  });

  const retryUtmifyWebEvent = useMutation({
    mutationFn: (deliveryId: string) => apiClient.retryTrackingUtmifyWebEvent(offerId, deliveryId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tracking-utmify-web-events', offerId] });
      toast.success('IC reenfileirado para a UTMify.');
    },
    onError: (error) => toast.error((error as Error).message),
  });
  return {
    config,
    setupTracking,
    utmify,
    utmifyPixel,
    metaPixels,
    tiktokDestinations,
    utmifyWebEvents,
    utmifyDeliveries,
    retryUtmifyWebEvent,
  };
}
