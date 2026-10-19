'use client';
import { TRACKING_DASHBOARD_STALE_TIME } from '@/components/tracking/tracking-query';
import { apiClient } from '@/lib/api-client';
import { useMutation } from '@tanstack/react-query';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { toast } from 'sonner';
import type { TrackingSectionId } from './tracking-navigation';
import type { useDestinationQueries } from './use-destination-queries';
import type { useDomainActions } from './use-domain-actions';
import type { useFormState } from './use-form-state';
import type { useTrackingPeriod } from './use-tracking-period';
export function useVendepayActions({
  offerId,
  qc,
  refresh,
  selectedVendepayConnectionId,
  selectedVendepayConnectionName,
  vendepaySigningSecret,
  setVendepaySigningSecret,
  section,
  config,
  setSelectedVendepayConnectionId,
  vendepayPayload,
}: {
  offerId: string;
  qc: ReturnType<typeof useTrackingPeriod>['qc'];
  refresh: ReturnType<typeof useDomainActions>['refresh'];
  selectedVendepayConnectionId: ReturnType<typeof useFormState>['selectedVendepayConnectionId'];
  selectedVendepayConnectionName: ReturnType<typeof useFormState>['selectedVendepayConnectionName'];
  vendepaySigningSecret: ReturnType<typeof useFormState>['vendepaySigningSecret'];
  setVendepaySigningSecret: ReturnType<typeof useFormState>['setVendepaySigningSecret'];
  section: TrackingSectionId;
  config: ReturnType<typeof useDestinationQueries>['config'];
  setSelectedVendepayConnectionId: ReturnType<
    typeof useFormState
  >['setSelectedVendepayConnectionId'];
  vendepayPayload: ReturnType<typeof useFormState>['vendepayPayload'];
}) {
  const toggleVendepayConnection = useMutation({
    mutationFn: (connection: { id: string; enabled: boolean }) =>
      apiClient.updateVendepayConnection(offerId, connection.id, {
        enabled: !connection.enabled,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tracking-config', offerId] });
      void refresh();
      toast.success('Status da conta atualizado.');
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const renameVendepayConnection = useMutation({
    mutationFn: () => {
      if (!selectedVendepayConnectionId) throw new Error('Selecione uma conta Vendepay.');
      return apiClient.updateVendepayConnection(offerId, selectedVendepayConnectionId, {
        name: selectedVendepayConnectionName.trim(),
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tracking-config', offerId] });
      void refresh();
      toast.success('Nome da conta Vendepay salvo.');
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const saveVendepaySigningSecret = useMutation({
    mutationFn: () => {
      if (!selectedVendepayConnectionId) throw new Error('Selecione uma conta Vendepay.');
      return apiClient.saveVendepayConnectionSigningSecret(
        offerId,
        selectedVendepayConnectionId,
        vendepaySigningSecret,
      );
    },
    onSuccess: () => {
      setVendepaySigningSecret('');
      void qc.invalidateQueries({ queryKey: ['tracking-config', offerId] });
      toast.success('Secret da Vendepay salvo com criptografia.');
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const vendepayReceipts = useQuery({
    queryKey: ['tracking-vendepay-receipts', offerId],
    queryFn: () => apiClient.listVendepayReceipts(offerId),
    enabled: section === 'gateways' && Boolean(config.data?.configured),
    refetchInterval: 30_000,
    retry: false,
    staleTime: TRACKING_DASHBOARD_STALE_TIME,
  });

  useEffect(() => {
    const connections = config.data?.vendepay?.connections ?? [];
    if (connections.length === 0) {
      setSelectedVendepayConnectionId('');
      return;
    }
    if (!connections.some((connection) => connection.id === selectedVendepayConnectionId)) {
      setSelectedVendepayConnectionId(connections[0]?.id ?? '');
    }
  }, [
    config.data?.vendepay?.connections,
    selectedVendepayConnectionId,
    setSelectedVendepayConnectionId,
  ]);

  const previewVendepay = useMutation({
    mutationFn: () => {
      let payload: unknown;
      try {
        payload = JSON.parse(vendepayPayload);
      } catch {
        throw new Error('O payload não é um JSON válido.');
      }
      return apiClient.previewVendepayWebhook(offerId, payload);
    },
    onError: (error) => toast.error((error as Error).message),
  });
  return {
    toggleVendepayConnection,
    renameVendepayConnection,
    saveVendepaySigningSecret,
    vendepayReceipts,
    previewVendepay,
  };
}
