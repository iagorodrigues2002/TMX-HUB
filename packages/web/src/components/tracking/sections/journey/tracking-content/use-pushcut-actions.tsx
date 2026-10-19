'use client';
import { TRACKING_DASHBOARD_STALE_TIME } from '@/components/tracking/tracking-query';
import { apiClient } from '@/lib/api-client';
import { useQuery } from '@tanstack/react-query';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { TrackingSectionId } from './tracking-navigation';
import type { useFormState } from './use-form-state';
import type { useTrackingPeriod } from './use-tracking-period';
export function usePushcutActions({
  offerId,
  section,
  pushcutName,
  pushcutSecret,
  pushcutFrontNotification,
  pushcutUpsellNotification,
  pushcutDevices,
  setPushcutName,
  setPushcutSecret,
  setPushcutFrontNotification,
  setPushcutUpsellNotification,
  setPushcutDevices,
  qc,
}: {
  offerId: string;
  section: TrackingSectionId;
  pushcutName: ReturnType<typeof useFormState>['pushcutName'];
  pushcutSecret: ReturnType<typeof useFormState>['pushcutSecret'];
  pushcutFrontNotification: ReturnType<typeof useFormState>['pushcutFrontNotification'];
  pushcutUpsellNotification: ReturnType<typeof useFormState>['pushcutUpsellNotification'];
  pushcutDevices: ReturnType<typeof useFormState>['pushcutDevices'];
  setPushcutName: ReturnType<typeof useFormState>['setPushcutName'];
  setPushcutSecret: ReturnType<typeof useFormState>['setPushcutSecret'];
  setPushcutFrontNotification: ReturnType<typeof useFormState>['setPushcutFrontNotification'];
  setPushcutUpsellNotification: ReturnType<typeof useFormState>['setPushcutUpsellNotification'];
  setPushcutDevices: ReturnType<typeof useFormState>['setPushcutDevices'];
  qc: ReturnType<typeof useTrackingPeriod>['qc'];
}) {
  const pushcutDestinations = useQuery({
    queryKey: ['tracking-pushcut-destinations', offerId],
    queryFn: () => apiClient.getTrackingPushcutDestinations(offerId),
    enabled: section === 'pushcut',
    retry: false,
    staleTime: TRACKING_DASHBOARD_STALE_TIME,
  });

  const pushcutDeliveries = useQuery({
    queryKey: ['tracking-pushcut-deliveries', offerId],
    queryFn: () => apiClient.listTrackingPushcutDeliveries(offerId),
    enabled: section === 'pushcut',
    refetchInterval: 30_000,
    retry: false,
    staleTime: TRACKING_DASHBOARD_STALE_TIME,
  });

  const createPushcutDestination = useMutation({
    mutationFn: () =>
      apiClient.createTrackingPushcutDestination(offerId, {
        name: pushcutName,
        secret: pushcutSecret,
        front_notification_name: pushcutFrontNotification,
        upsell_notification_name: pushcutUpsellNotification || null,
        devices: pushcutDevices
          .split(',')
          .map((d) => d.trim())
          .filter(Boolean),
      }),
    onSuccess: () => {
      setPushcutName('');
      setPushcutSecret('');
      setPushcutFrontNotification('');
      setPushcutUpsellNotification('');
      setPushcutDevices('');
      void qc.invalidateQueries({ queryKey: ['tracking-pushcut-destinations', offerId] });
      toast.success('Destino Pushcut adicionado.');
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const togglePushcutDestination = useMutation({
    mutationFn: (input: { destinationId: string; enabled: boolean }) =>
      apiClient.setTrackingPushcutDestinationEnabled(offerId, input.destinationId, input.enabled),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tracking-pushcut-destinations', offerId] });
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const removePushcutDestination = useMutation({
    mutationFn: (destinationId: string) =>
      apiClient.deleteTrackingPushcutDestination(offerId, destinationId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tracking-pushcut-destinations', offerId] });
      toast.success('Destino Pushcut removido.');
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const testPushcutDestination = useMutation({
    mutationFn: (destinationId: string) =>
      apiClient.testTrackingPushcutDestination(offerId, destinationId),
    onSuccess: (result) => {
      if (result.accepted) {
        toast.success('Notificação de teste enviada. Confira seu dispositivo.');
        return;
      }
      const pushcutMessage = result.response?.error;
      const detail = pushcutMessage
        ? `${pushcutMessage}${result.status ? ` (HTTP ${result.status})` : ''}`
        : (result.error ?? `Pushcut respondeu com erro (HTTP ${result.status}).`);
      toast.error(`Pushcut recusou o teste: ${detail}`);
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const retryPushcutDelivery = useMutation({
    mutationFn: (deliveryId: string) => apiClient.retryTrackingPushcutDelivery(offerId, deliveryId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tracking-pushcut-deliveries', offerId] });
      toast.success('Reenvio colocado na fila.');
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const resendPushcutHistory = useMutation({
    mutationFn: () => apiClient.resendTrackingPushcutHistory(offerId),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: ['tracking-pushcut-deliveries', offerId] });
      toast.success(
        `${result.notifications_queued} notificação(ões) enfileirada(s) de ${result.orders_scanned} pedido(s) pago(s).`,
      );
    },
    onError: (error) => toast.error((error as Error).message),
  });
  return {
    pushcutDestinations,
    pushcutDeliveries,
    createPushcutDestination,
    togglePushcutDestination,
    removePushcutDestination,
    testPushcutDestination,
    retryPushcutDelivery,
    resendPushcutHistory,
  };
}
