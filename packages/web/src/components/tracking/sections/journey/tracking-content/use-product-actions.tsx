'use client';
import { TRACKING_DASHBOARD_STALE_TIME } from '@/components/tracking/tracking-query';
import { apiClient } from '@/lib/api-client';
import type { TrackingProductKind } from '@/lib/api-client';
import { useQuery } from '@tanstack/react-query';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { TrackingSectionId } from './tracking-navigation';
import type { useFormState } from './use-form-state';
import type { useTrackingPeriod } from './use-tracking-period';
export function useProductActions({
  offerId,
  section,
  setProductKindSelection,
  qc,
  refreshTracking,
}: {
  offerId: string;
  section: TrackingSectionId;
  setProductKindSelection: ReturnType<typeof useFormState>['setProductKindSelection'];
  qc: ReturnType<typeof useTrackingPeriod>['qc'];
  refreshTracking: ReturnType<typeof useTrackingPeriod>['refreshTracking'];
}) {
  const productKinds = useQuery({
    queryKey: ['tracking-product-kinds', offerId],
    queryFn: () => apiClient.getTrackingProductKinds(offerId),
    enabled: section === 'utmify',
    refetchInterval: 30_000,
    retry: false,
    staleTime: TRACKING_DASHBOARD_STALE_TIME,
  });

  const saveProductKind = useMutation({
    mutationFn: (input: {
      product_id: string;
      kind: TrackingProductKind;
      label?: string | null;
    }) => apiClient.setTrackingProductKind(offerId, input),
    onSuccess: (result, variables) => {
      setProductKindSelection((prev) => {
        const next = { ...prev };
        delete next[variables.product_id];
        return next;
      });
      void qc.invalidateQueries({ queryKey: ['tracking-product-kinds', offerId] });
      void refreshTracking();
      toast.success(
        `Produto classificado · ${result.orders_updated} pedido(s) existente(s) atualizado(s).`,
      );
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const removeProductKind = useMutation({
    mutationFn: (productId: string) => apiClient.deleteTrackingProductKind(offerId, productId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tracking-product-kinds', offerId] });
      toast.success('Mapeamento removido.');
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const recomputeProductKinds = useMutation({
    mutationFn: () => apiClient.recomputeTrackingProductKinds(offerId),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: ['tracking-product-kinds', offerId] });
      void refreshTracking();
      toast.success(`${result.updated} pedido(s) reclassificado(s).`);
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const reconcileUtmifyUpsells = useMutation({
    mutationFn: () => apiClient.reconcileTrackingUtmifyUpsells(offerId),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: ['tracking-utmify-deliveries', offerId] });
      void refreshTracking();
      toast.success(
        `${result.upsells_repaired} upsell(s) atribuídos · ${result.utmify_queued} atualização(ões) enviadas à UTMify.`,
      );
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const reconcileUtmifyFront = useMutation({
    mutationFn: () => apiClient.reconcileTrackingUtmifyFront(offerId),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: ['tracking-utmify-deliveries', offerId] });
      void refreshTracking();
      toast.success(
        `${result.fully_attributed}/${result.front_orders_scanned} vendas front com campanha completa · ${result.utmify_queued} atualização(ões) reenfileiradas.`,
      );
    },
    onError: (error) => toast.error((error as Error).message),
  });
  return {
    productKinds,
    saveProductKind,
    removeProductKind,
    recomputeProductKinds,
    reconcileUtmifyUpsells,
    reconcileUtmifyFront,
  };
}
