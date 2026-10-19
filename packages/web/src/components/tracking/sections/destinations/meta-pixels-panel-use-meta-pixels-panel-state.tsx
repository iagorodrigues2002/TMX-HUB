'use client';

import { TRACKING_DASHBOARD_STALE_TIME } from '@/components/tracking/tracking-query';
import { apiClient } from '@/lib/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import type { MetaPixelsPanelProps } from './meta-pixels-panel-meta-pixels-panel-props';

export function useMetaPixelsPanelState({ offerId, canManage }: MetaPixelsPanelProps) {
  const queryClient = useQueryClient();
  const [pixelName, setPixelName] = useState('');
  const [pixelId, setPixelId] = useState('');
  const [pixelToken, setPixelToken] = useState('');
  const [testEventCode, setTestEventCode] = useState('');
  const [editingPixelId, setEditingPixelId] = useState<string | null>(null);
  const [pixelTestCodes, setPixelTestCodes] = useState<Record<string, string>>({});
  const [pixelProducts, setPixelProducts] = useState<Record<string, string[]>>({});

  const config = useQuery({
    queryKey: ['tracking-config', offerId],
    queryFn: () => apiClient.getTrackingConfig(offerId),
    retry: false,
    staleTime: TRACKING_DASHBOARD_STALE_TIME,
  });
  const pixels = useQuery({
    queryKey: ['tracking-meta-pixels', offerId],
    queryFn: () => apiClient.listMetaPixels(offerId),
    enabled: Boolean(config.data?.configured),
    retry: false,
    staleTime: TRACKING_DASHBOARD_STALE_TIME,
  });
  const productKinds = useQuery({
    queryKey: ['tracking-product-kinds', offerId],
    queryFn: () => apiClient.getTrackingProductKinds(offerId),
    enabled: Boolean(config.data?.configured),
    retry: false,
    staleTime: TRACKING_DASHBOARD_STALE_TIME,
  });

  const savePixelProducts = useMutation({
    mutationFn: ({ pixelId, productIds }: { pixelId: string; productIds: string[] }) =>
      apiClient.setMetaPixelProducts(offerId, pixelId, productIds),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tracking-meta-pixels', offerId] });
      toast.success('Produtos autorizados para o pixel foram salvos.');
    },
    onError: (error) => toast.error((error as Error).message),
  });
  const savePixel = useMutation<
    | { updated: true }
    | {
        updated: false;
        verification: 'verified' | 'pending_event_test';
        verification_warning?: string;
        backfill_queued: number;
      }
  >({
    mutationFn: () => {
      const input = {
        name: pixelName.trim(),
        pixel_id: pixelId.trim(),
        ...(pixelToken.trim() ? { access_token: pixelToken.trim() } : {}),
        test_event_code: testEventCode.trim() || null,
      };
      if (editingPixelId) {
        return apiClient
          .updateMetaPixel(offerId, editingPixelId, input)
          .then(() => ({ updated: true as const }));
      }
      return apiClient
        .saveMetaPixel(offerId, {
          name: input.name,
          pixel_id: input.pixel_id,
          access_token: pixelToken.trim(),
          ...(input.test_event_code ? { test_event_code: input.test_event_code } : {}),
        })
        .then((result) => ({ updated: false as const, ...result }));
    },
    onSuccess: (result) => {
      setPixelName('');
      setPixelId('');
      setPixelToken('');
      setTestEventCode('');
      setEditingPixelId(null);
      void queryClient.invalidateQueries({ queryKey: ['tracking-meta-pixels', offerId] });
      if (result.updated) {
        toast.success(
          'Pixel atualizado. O token anterior foi preservado quando deixado em branco.',
        );
        return;
      }
      if (result.verification === 'verified') {
        toast.success(
          `Pixel Meta validado. ${result.backfill_queued} conversão(ões) recente(s) enviada(s) para popular o pixel.`,
        );
      } else {
        toast.warning(
          `${result.verification_warning ?? 'Pixel salvo. Faça um envio em Test Events.'} ${result.backfill_queued} conversão(ões) recente(s) foram enfileiradas.`,
        );
      }
    },
    onError: (error) => toast.error((error as Error).message),
  });
  const sendTestEvent = useMutation({
    mutationFn: ({
      pixelId,
      eventName,
    }: {
      pixelId: string;
      eventName: 'InitiateCheckout' | 'Purchase';
    }) => apiClient.sendMetaTestEvent(offerId, pixelId, eventName),
    onSuccess: (result) =>
      toast.success(
        `${result.event_name} aceito pela Meta (${result.events_received} evento recebido).`,
      ),
    onError: (error) => toast.error((error as Error).message),
  });
  const updateTestEventCode = useMutation({
    mutationFn: ({ pixelId, code }: { pixelId: string; code: string }) =>
      apiClient.updateMetaTestEventCode(offerId, pixelId, code),
    onSuccess: (_, variables) => {
      setPixelTestCodes((current) => ({ ...current, [variables.pixelId]: '' }));
      void queryClient.invalidateQueries({ queryKey: ['tracking-meta-pixels', offerId] });
      toast.success('Test Event Code salvo. Os botões de teste estão liberados.');
    },
    onError: (error) => toast.error((error as Error).message),
  });
  return {
    canManage,
    pixelName,
    setPixelName,
    pixelId,
    setPixelId,
    pixelToken,
    setPixelToken,
    testEventCode,
    setTestEventCode,
    editingPixelId,
    setEditingPixelId,
    pixelTestCodes,
    setPixelTestCodes,
    pixelProducts,
    setPixelProducts,
    config,
    pixels,
    productKinds,
    savePixelProducts,
    savePixel,
    sendTestEvent,
    updateTestEventCode,
  };
}
