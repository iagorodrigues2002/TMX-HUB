'use client';

import { type TikTokDestination, type TikTokDestinationInput, apiClient } from '@/lib/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { type TikTokTestContext, empty } from './tiktok-destinations-support';

export function useTikTokDestinationsState({ offerId }: { offerId: string }) {
  const qc = useQueryClient();
  const key = ['tiktok-destinations', offerId];
  const [form, setForm] = useState<TikTokDestinationInput>(empty);
  const [editing, setEditing] = useState<TikTokDestination | null>(null);
  const [testContext, setTestContext] = useState<Record<string, TikTokTestContext>>({});
  const [testDelivery, setTestDelivery] = useState<string | null>(null);
  const destinations = useQuery({
    queryKey: key,
    queryFn: () => apiClient.tiktokDestinations(offerId),
    retry: false,
  });
  const delivery = useQuery({
    queryKey: ['tiktok-delivery', offerId, testDelivery],
    queryFn: () => apiClient.tiktokDelivery(offerId, testDelivery!),
    enabled: Boolean(testDelivery),
    refetchInterval: (query) =>
      ['pending', 'processing', 'test'].includes(query.state.data?.delivery.state ?? '')
        ? 1500
        : false,
  });
  useEffect(() => {
    if (delivery.data?.delivery.state === 'delivered')
      toast.success(
        'TikTok confirmou o evento de teste. Confira também a aba Test Events no Events Manager.',
      );
  }, [delivery.data?.delivery.state]);
  const save = useMutation({
    mutationFn: () =>
      apiClient.saveTikTokDestination(
        offerId,
        { ...form, test_event_code: form.test_event_code?.trim() || null },
        editing?.id,
      ),
    onSuccess: () => {
      setForm(empty);
      setEditing(null);
      void qc.invalidateQueries({ queryKey: key });
      toast.success('Pixel TikTok salvo com credencial protegida.');
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiClient.deleteTikTokDestination(offerId, id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: key }),
  });
  const test = useMutation({
    mutationFn: ({ id, context }: { id: string; context: TikTokTestContext }) =>
      apiClient.testTikTokDestination(offerId, id, {
        test_event_code: context.code,
        ...(context.eventUrl.trim() ? { event_url: context.eventUrl.trim() } : {}),
        ...(context.email.trim() ? { email: context.email.trim() } : {}),
        ...(context.phone.trim() ? { phone: context.phone.trim() } : {}),
      }),
    onSuccess: (result) => {
      setTestDelivery(result.delivery_id);
      toast.success('Evento enviado. Aguardando confirmação da Events API…');
    },
  });
  const edit = (d: TikTokDestination) => {
    setEditing(d);
    setForm({
      name: d.name,
      pixel_code: d.pixel_code,
      access_token: '',
      test_event_code: d.test_event_code,
      enabled: d.enabled,
    });
  };
  return {
    key,
    form,
    setForm,
    editing,
    setEditing,
    testContext,
    setTestContext,
    testDelivery,
    destinations,
    delivery,
    save,
    remove,
    test,
    edit,
  };
}
