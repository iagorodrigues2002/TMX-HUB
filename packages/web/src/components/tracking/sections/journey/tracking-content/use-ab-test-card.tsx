'use client';
import { TRACKING_DASHBOARD_STALE_TIME } from '@/components/tracking/tracking-query';
import { apiClient } from '@/lib/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { useQuery } from '@tanstack/react-query';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
export function useAbTestCard({
  test,
  offerId,
  from,
  to,
  onUpdated,
}: {
  test: {
    id: string;
    name: string;
    kind: 'checkout' | 'presell';
    status: string;
    traffic_a: number;
    redirect_url: string;
    winner_variant_id?: string;
    variants: Array<{ id: string; label: string; destination_url?: string; position: number }>;
  };
  offerId: string;
  from: string;
  to: string;
  onUpdated: () => void;
}) {
  const qc = useQueryClient();

  const [editing, setEditing] = useState(false);

  const [editName, setEditName] = useState(test.name);

  const [editTrafficA, setEditTrafficA] = useState(String(test.traffic_a));

  const [editLabels, setEditLabels] = useState(test.variants.map((variant) => variant.label));

  const [editDestinations, setEditDestinations] = useState(
    test.variants.map((variant) => variant.destination_url ?? ''),
  );

  const metrics = useQuery({
    queryKey: ['tracking-ab-metrics', offerId, test.id, from, to],
    queryFn: () => apiClient.getTrackingAbTestMetrics(offerId, test.id, { from, to }),
    refetchInterval: test.status === 'active' ? 30_000 : false,
    staleTime: TRACKING_DASHBOARD_STALE_TIME,
  });

  const control = useMutation({
    mutationFn: (
      body: { action: 'pause' | 'resume' } | { action: 'select_winner'; variant_id: string },
    ) => apiClient.controlTrackingAbTest(offerId, test.id, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tracking-ab-metrics', offerId, test.id] });
      onUpdated();
      toast.success('Teste A/B atualizado.');
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const remove = useMutation({
    mutationFn: () => apiClient.deleteTrackingAbTest(offerId, test.id),
    onSuccess: () => {
      onUpdated();
      toast.success('Teste A/B removido.');
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const saveConfiguration = useMutation({
    mutationFn: () =>
      apiClient.controlTrackingAbTest(offerId, test.id, {
        action: 'update_config',
        name: editName.trim(),
        traffic_a: Number(editTrafficA),
        variants: test.variants.map((variant, index) => ({
          id: variant.id,
          label: (editLabels[index] ?? '').trim(),
          destination_url: (editDestinations[index] ?? '').trim(),
        })),
      }),
    onSuccess: () => {
      setEditing(false);
      onUpdated();
      void qc.invalidateQueries({ queryKey: ['tracking-ab-metrics', offerId, test.id] });
      toast.success('Teste A/B editado. O link público e o histórico foram mantidos.');
    },
    onError: (error) => toast.error((error as Error).message),
  });
  return {
    qc,
    editing,
    setEditing,
    editName,
    setEditName,
    editTrafficA,
    setEditTrafficA,
    editLabels,
    setEditLabels,
    editDestinations,
    setEditDestinations,
    metrics,
    control,
    remove,
    saveConfiguration,
  };
}
