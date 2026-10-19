'use client';
import { apiClient } from '@/lib/api-client';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { useFormState } from './use-form-state';
import type { useTrackingPeriod } from './use-tracking-period';
export function useUpsellActions({
  upsellConnectionDestinations,
  upsellDestination,
  editingUpsellStageId,
  offerId,
  upsellStageName,
  upsellStageKey,
  setUpsellDestination,
  setUpsellConnectionDestinations,
  setEditingUpsellStageId,
  qc,
}: {
  upsellConnectionDestinations: ReturnType<typeof useFormState>['upsellConnectionDestinations'];
  upsellDestination: ReturnType<typeof useFormState>['upsellDestination'];
  editingUpsellStageId: ReturnType<typeof useFormState>['editingUpsellStageId'];
  offerId: string;
  upsellStageName: ReturnType<typeof useFormState>['upsellStageName'];
  upsellStageKey: ReturnType<typeof useFormState>['upsellStageKey'];
  setUpsellDestination: ReturnType<typeof useFormState>['setUpsellDestination'];
  setUpsellConnectionDestinations: ReturnType<
    typeof useFormState
  >['setUpsellConnectionDestinations'];
  setEditingUpsellStageId: ReturnType<typeof useFormState>['setEditingUpsellStageId'];
  qc: ReturnType<typeof useTrackingPeriod>['qc'];
}) {
  const saveUpsellStage = useMutation({
    mutationFn: () => {
      const accountDestination = Object.values(upsellConnectionDestinations).find((url) =>
        url.startsWith('http'),
      );
      const destinationUrl = accountDestination ?? upsellDestination;
      return editingUpsellStageId
        ? apiClient.updateTrackingUpsell(offerId, editingUpsellStageId, {
            name: upsellStageName,
            destination_url: destinationUrl,
            connection_destinations: upsellConnectionDestinations,
          })
        : apiClient.saveTrackingUpsell(offerId, {
            stage_key: upsellStageKey,
            name: upsellStageName,
            destination_url: destinationUrl,
            connection_destinations: upsellConnectionDestinations,
          });
    },
    onSuccess: () => {
      setUpsellDestination('');
      setUpsellConnectionDestinations({});
      setEditingUpsellStageId('');
      void qc.invalidateQueries({ queryKey: ['tracking-upsells', offerId] });
      void qc.invalidateQueries({ queryKey: ['tracking-upsell-identities', offerId] });
      void qc.invalidateQueries({ queryKey: ['upsell-compatibility'] });
      toast.success(editingUpsellStageId ? 'Etapa atualizada.' : 'Nova etapa salva separadamente.');
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const deleteUpsellStage = useMutation({
    mutationFn: (stageId: string) => apiClient.deleteTrackingUpsell(offerId, stageId),
    onSuccess: (_result, stageId) => {
      if (editingUpsellStageId === stageId) {
        setEditingUpsellStageId('');
        setUpsellDestination('');
        setUpsellConnectionDestinations({});
      }
      void qc.invalidateQueries({ queryKey: ['tracking-upsells', offerId] });
      toast.success('Etapa de upsell apagada.');
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const reconcileUpsellIdentities = useMutation({
    mutationFn: () => apiClient.reconcileTrackingUpsellIdentities(offerId),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: ['tracking-upsell-identities', offerId] });
      toast.success(
        `${result.vendid_found} vendaId aprovados encontrados · ${result.identities_stored} recuperados · ${result.non_paid_removed} não aprovados removidos.`,
      );
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const recoverFailedUpsellLinks = useMutation({
    mutationFn: () => apiClient.recoverFailedTrackingUpsellLinks(offerId),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: ['tracking-upsell-identities', offerId] });
      void qc.invalidateQueries({ queryKey: ['upsell-compatibility'] });
      toast.success(
        `${result.recovered} elegíveis pela API de ${result.inspected} · ${result.already_converted} já convertidos · ${result.temporary_failures} falhas temporárias · ${result.definitive_failures} recusas reais. Suas marcações manuais não foram alteradas.`,
      );
    },
    onError: (error) => toast.error((error as Error).message),
  });
  return {
    saveUpsellStage,
    deleteUpsellStage,
    reconcileUpsellIdentities,
    recoverFailedUpsellLinks,
  };
}
