'use client';
import { apiClient } from '@/lib/api-client';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { useDomainActions } from './use-domain-actions';
import type { useFormState } from './use-form-state';
import type { useTrackingPeriod } from './use-tracking-period';
export function useEntryLinkActions({
  offerId,
  testName,
  kind,
  trafficA,
  armA,
  destinationA,
  armB,
  destinationB,
  setVendepayWebhook,
  setTestName,
  setDestinationA,
  setDestinationB,
  qc,
  refresh,
  entryLinkName,
  entryDestination,
  entryTrafficSource,
  setEntryLinkName,
  setEntryDestination,
  setEntryTrafficSource,
  editingEntryLinkId,
  editingEntryLinkName,
  editingEntryDestination,
  editingEntryTrafficSource,
  setEditingEntryLinkId,
  convertingEntryLinkId,
  entryAbName,
  entryAbTrafficA,
  entryAbDestinationA,
  entryAbDestinationB,
  setConvertingEntryLinkId,
  setEntryAbName,
  setEntryAbDestinationA,
  setEntryAbDestinationB,
}: {
  offerId: string;
  testName: ReturnType<typeof useFormState>['testName'];
  kind: ReturnType<typeof useFormState>['kind'];
  trafficA: ReturnType<typeof useFormState>['trafficA'];
  armA: ReturnType<typeof useFormState>['armA'];
  destinationA: ReturnType<typeof useFormState>['destinationA'];
  armB: ReturnType<typeof useFormState>['armB'];
  destinationB: ReturnType<typeof useFormState>['destinationB'];
  setVendepayWebhook: ReturnType<typeof useFormState>['setVendepayWebhook'];
  setTestName: ReturnType<typeof useFormState>['setTestName'];
  setDestinationA: ReturnType<typeof useFormState>['setDestinationA'];
  setDestinationB: ReturnType<typeof useFormState>['setDestinationB'];
  qc: ReturnType<typeof useTrackingPeriod>['qc'];
  refresh: ReturnType<typeof useDomainActions>['refresh'];
  entryLinkName: ReturnType<typeof useFormState>['entryLinkName'];
  entryDestination: ReturnType<typeof useFormState>['entryDestination'];
  entryTrafficSource: ReturnType<typeof useFormState>['entryTrafficSource'];
  setEntryLinkName: ReturnType<typeof useFormState>['setEntryLinkName'];
  setEntryDestination: ReturnType<typeof useFormState>['setEntryDestination'];
  setEntryTrafficSource: ReturnType<typeof useFormState>['setEntryTrafficSource'];
  editingEntryLinkId: ReturnType<typeof useFormState>['editingEntryLinkId'];
  editingEntryLinkName: ReturnType<typeof useFormState>['editingEntryLinkName'];
  editingEntryDestination: ReturnType<typeof useFormState>['editingEntryDestination'];
  editingEntryTrafficSource: ReturnType<typeof useFormState>['editingEntryTrafficSource'];
  setEditingEntryLinkId: ReturnType<typeof useFormState>['setEditingEntryLinkId'];
  convertingEntryLinkId: ReturnType<typeof useFormState>['convertingEntryLinkId'];
  entryAbName: ReturnType<typeof useFormState>['entryAbName'];
  entryAbTrafficA: ReturnType<typeof useFormState>['entryAbTrafficA'];
  entryAbDestinationA: ReturnType<typeof useFormState>['entryAbDestinationA'];
  entryAbDestinationB: ReturnType<typeof useFormState>['entryAbDestinationB'];
  setConvertingEntryLinkId: ReturnType<typeof useFormState>['setConvertingEntryLinkId'];
  setEntryAbName: ReturnType<typeof useFormState>['setEntryAbName'];
  setEntryAbDestinationA: ReturnType<typeof useFormState>['setEntryAbDestinationA'];
  setEntryAbDestinationB: ReturnType<typeof useFormState>['setEntryAbDestinationB'];
}) {
  const createTest = useMutation({
    mutationFn: async () => {
      const current = await apiClient.getTrackingConfig(offerId);
      const setup = current.configured ? null : await apiClient.setupTracking(offerId);
      await apiClient.createTrackingAbTest(offerId, {
        name: testName,
        kind,
        traffic_a: Number(trafficA),
        variants: [
          {
            label: armA,
            gateway: kind === 'checkout' ? 'vendepay' : undefined,
            destination_url: destinationA,
          },
          {
            label: armB,
            gateway: kind === 'checkout' ? 'vendepay' : undefined,
            destination_url: destinationB,
          },
        ],
      });
      return setup;
    },
    onSuccess: (setup) => {
      if (setup?.vendepay_webhook_url) setVendepayWebhook(setup.vendepay_webhook_url);
      setTestName('');
      setDestinationA('');
      setDestinationB('');
      void qc.invalidateQueries({ queryKey: ['tracking-config', offerId] });
      void refresh();
      toast.success(
        setup?.vendepay_webhook_url
          ? 'Teste A/B criado e tracking ativado. O webhook está disponível em Gateways.'
          : 'Teste A/B ativado.',
      );
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const createEntryLink = useMutation({
    mutationFn: async () => {
      const current = await apiClient.getTrackingConfig(offerId);
      const setup = current.configured ? null : await apiClient.setupTracking(offerId);
      await apiClient.createTrackingEntryLink(offerId, {
        name: entryLinkName,
        destination_url: entryDestination,
        traffic_source: entryTrafficSource,
      });
      return setup;
    },
    onSuccess: (setup) => {
      if (setup?.vendepay_webhook_url) setVendepayWebhook(setup.vendepay_webhook_url);
      setEntryLinkName('');
      setEntryDestination('');
      setEntryTrafficSource('meta');
      void qc.invalidateQueries({ queryKey: ['tracking-config', offerId] });
      void refresh();
      toast.success(
        setup?.vendepay_webhook_url
          ? 'Link criado e tracking ativado. O webhook está disponível em Gateways.'
          : 'Link de entrada criado.',
      );
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const removeEntryLink = useMutation({
    mutationFn: (linkId: string) => apiClient.deleteTrackingEntryLink(offerId, linkId),
    onSuccess: () => {
      void refresh();
      toast.success('Link de entrada removido.');
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const updateEntryLink = useMutation({
    mutationFn: () =>
      apiClient.updateTrackingEntryLink(offerId, editingEntryLinkId, {
        name: editingEntryLinkName,
        destination_url: editingEntryDestination,
        traffic_source: editingEntryTrafficSource,
      }),
    onSuccess: () => {
      setEditingEntryLinkId('');
      void refresh();
      toast.success('Destino atualizado. A URL pública do anúncio não mudou.');
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const convertEntryLinkToAb = useMutation({
    mutationFn: () =>
      apiClient.convertTrackingEntryLinkToAbTest(offerId, convertingEntryLinkId, {
        name: entryAbName,
        traffic_a: Number(entryAbTrafficA),
        variants: [
          { label: 'A', destination_url: entryAbDestinationA },
          { label: 'B', destination_url: entryAbDestinationB },
        ],
      }),
    onSuccess: () => {
      setConvertingEntryLinkId('');
      setEntryAbName('');
      setEntryAbDestinationA('');
      setEntryAbDestinationB('');
      void refresh();
      toast.success('Teste A/B ativado na mesma URL já usada no anúncio.');
    },
    onError: (error) => toast.error((error as Error).message),
  });
  return { createTest, createEntryLink, removeEntryLink, updateEntryLink, convertEntryLinkToAb };
}
