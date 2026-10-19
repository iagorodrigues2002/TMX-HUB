'use client';
import { TRACKING_DASHBOARD_STALE_TIME } from '@/components/tracking/tracking-query';
import { apiClient } from '@/lib/api-client';
import { useQuery } from '@tanstack/react-query';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { TrackingSectionId } from './tracking-navigation';
import type { useFormState } from './use-form-state';
import type { useTrackingPeriod } from './use-tracking-period';
export function useDomainActions({
  offerId,
  section,
  qc,
  trackingPeriod,
  domain,
  domainKind,
  setDomain,
  attributedOnly,
  minimum,
}: {
  offerId: string;
  section: TrackingSectionId;
  qc: ReturnType<typeof useTrackingPeriod>['qc'];
  trackingPeriod: ReturnType<typeof useTrackingPeriod>['trackingPeriod'];
  domain: ReturnType<typeof useFormState>['domain'];
  domainKind: ReturnType<typeof useFormState>['domainKind'];
  setDomain: ReturnType<typeof useFormState>['setDomain'];
  attributedOnly: ReturnType<typeof useFormState>['attributedOnly'];
  minimum: ReturnType<typeof useFormState>['minimum'];
}) {
  const metaDeliveries = useQuery({
    queryKey: ['tracking-meta-deliveries', offerId],
    queryFn: () => apiClient.listMetaDeliveries(offerId),
    enabled: section === 'meta',
    refetchInterval: 30_000,
    retry: false,
    staleTime: TRACKING_DASHBOARD_STALE_TIME,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['tracking-advanced', offerId] });

  const reconcileInitiateCheckouts = useMutation({
    mutationFn: () => apiClient.reconcileInitiateCheckouts(offerId, trackingPeriod),
    onSuccess: (result) => {
      void Promise.all([
        qc.invalidateQueries({ queryKey: ['tracking-meta-deliveries', offerId] }),
        qc.invalidateQueries({ queryKey: ['tracking-utmify-deliveries', offerId] }),
        qc.invalidateQueries({ queryKey: ['tracking-utmify-web-events', offerId] }),
        qc.invalidateQueries({ queryKey: ['tracking-attribution', offerId] }),
      ]);
      toast.success(
        `${result.events_found} ICs conferidos · ${result.attribution_recovered} enriquecidos com os PageViews · ${result.meta_queued} Meta reenfileirados · ${result.utmify_queued} UTMify.`,
      );
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const reconcileMetaPurchases = useMutation({
    mutationFn: () => apiClient.reconcileMetaPurchases(offerId),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: ['tracking-meta-deliveries', offerId] });
      toast.success(
        `${result.orders_found} compras conferidas · ${result.purchases_queued} Purchase reenfileirados para a Meta.`,
      );
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const replayMetaEvents = useMutation({
    mutationFn: () => apiClient.replayMetaEvents(offerId),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: ['tracking-meta-deliveries', offerId] });
      toast.success(
        `${result.pageviews_queued} PageViews · ${result.initiate_checkouts_queued} ICs · ${result.front_purchases_queued} compras front reenfileirados para ${result.pixels_enabled} pixel(is).`,
      );
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const addDomain = useMutation({
    mutationFn: () => apiClient.addTrackingDomain(offerId, domain, domainKind),
    onSuccess: () => {
      setDomain('');
      void refresh();
      toast.success('Domínio adicionado.');
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const verifyDomain = useMutation({
    mutationFn: (domainId: string) => apiClient.verifyTrackingDomain(offerId, domainId),
    onSuccess: (result) => {
      void refresh();
      if (result.status === 'live') toast.success('Domínio confirmado e recebendo eventos.');
      else toast.info(result.detail);
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const removeDomain = useMutation({
    mutationFn: (domainId: string) => apiClient.removeTrackingDomain(offerId, domainId),
    onSuccess: () => {
      void refresh();
      toast.success('Domínio removido.');
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const saveRules = useMutation({
    mutationFn: () =>
      apiClient.saveTrackingMetaRules(offerId, {
        attributed_only: attributedOnly,
        minimum_amount_minor: Math.round(Number(minimum || 0) * 100),
      }),
    onSuccess: () => {
      void refresh();
      toast.success('Regras de envio salvas.');
    },
    onError: (error) => toast.error((error as Error).message),
  });
  return {
    metaDeliveries,
    refresh,
    reconcileInitiateCheckouts,
    reconcileMetaPurchases,
    replayMetaEvents,
    addDomain,
    verifyDomain,
    removeDomain,
    saveRules,
  };
}
