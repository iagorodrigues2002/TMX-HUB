'use client';
import { apiClient } from '@/lib/api-client';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { useDestinationQueries } from './use-destination-queries';
import type { useFormState } from './use-form-state';
import type { useTrackingPeriod } from './use-tracking-period';
export function useUtmifyActions({
  config,
  offerId,
  utmifyToken,
  utmifyEndpoint,
  setVendepayWebhook,
  setSection,
  setUtmifyToken,
  qc,
  utmifyPixelId,
  setUtmifyPixelId,
}: {
  config: ReturnType<typeof useDestinationQueries>['config'];
  offerId: string;
  utmifyToken: ReturnType<typeof useFormState>['utmifyToken'];
  utmifyEndpoint: ReturnType<typeof useFormState>['utmifyEndpoint'];
  setVendepayWebhook: ReturnType<typeof useFormState>['setVendepayWebhook'];
  setSection: ReturnType<typeof useFormState>['setSection'];
  setUtmifyToken: ReturnType<typeof useFormState>['setUtmifyToken'];
  qc: ReturnType<typeof useTrackingPeriod>['qc'];
  utmifyPixelId: ReturnType<typeof useFormState>['utmifyPixelId'];
  setUtmifyPixelId: ReturnType<typeof useFormState>['setUtmifyPixelId'];
}) {
  const saveUtmify = useMutation({
    mutationFn: async () => {
      const setup = config.data?.configured ? null : await apiClient.setupTracking(offerId);
      const destination = await apiClient.saveTrackingUtmifyDestination(offerId, {
        name: 'UTMify',
        api_token: utmifyToken,
        endpoint_url: utmifyEndpoint,
      });
      return { destination, setup };
    },
    onSuccess: ({ setup }) => {
      if (setup?.vendepay_webhook_url) {
        setVendepayWebhook(setup.vendepay_webhook_url);
        setSection('gateways');
      }
      setUtmifyToken('');
      void qc.invalidateQueries({ queryKey: ['tracking-config', offerId] });
      void qc.invalidateQueries({ queryKey: ['tracking-utmify-destination', offerId] });
      toast.success(
        setup?.vendepay_webhook_url
          ? 'Tracking e UTMify configurados. O webhook da Vendepay já foi gerado.'
          : 'Destino UTMify configurado.',
      );
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const toggleUtmify = useMutation({
    mutationFn: (enabled: boolean) =>
      apiClient.setTrackingUtmifyDestinationEnabled(offerId, enabled),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: ['tracking-utmify-destination', offerId] });
      toast.success(
        result.destination.enabled
          ? 'Envio de vendas à UTMify ativado.'
          : 'Envio de vendas à UTMify pausado.',
      );
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const saveUtmifyPixel = useMutation({
    mutationFn: async () => {
      const setup = config.data?.configured ? null : await apiClient.setupTracking(offerId);
      const pixel = await apiClient.saveTrackingUtmifyPixel(offerId, utmifyPixelId);
      return { pixel, setup };
    },
    onSuccess: ({ pixel: result, setup }) => {
      if (setup?.vendepay_webhook_url) {
        setVendepayWebhook(setup.vendepay_webhook_url);
        setSection('gateways');
      }
      setUtmifyPixelId('');
      void qc.invalidateQueries({ queryKey: ['tracking-config', offerId] });
      void qc.invalidateQueries({ queryKey: ['tracking-utmify-pixel', offerId] });
      toast.success(`Pixel UTMify ${result.pixel_id} salvo. Reconcilie os ICs do dia.`);
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const retryUtmify = useMutation({
    mutationFn: (deliveryId: string) => apiClient.retryTrackingUtmifyDelivery(offerId, deliveryId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tracking-utmify-deliveries', offerId] });
      toast.success('Reenvio colocado na fila.');
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const testUtmifyCheckout = useMutation({
    mutationFn: () => apiClient.sendTrackingUtmifyTestCheckout(offerId),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: ['tracking-utmify-deliveries', offerId] });
      toast.success(`Checkout de teste enviado: ${result.transaction_id}`);
    },
    onError: (error) => toast.error((error as Error).message),
  });
  return { saveUtmify, toggleUtmify, saveUtmifyPixel, retryUtmify, testUtmifyCheckout };
}
