'use client';

import { apiClient } from '@/lib/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { DEFAULT_FORM } from './utmify-global-center-support';

export function useUtmifyGlobalCenterState() {
  const qc = useQueryClient();
  const config = useQuery({
    queryKey: ['utmify-global'],
    queryFn: () => apiClient.getUtmifyGlobal(),
    refetchInterval: 15_000,
  });
  const [form, setForm] = useState(DEFAULT_FORM);
  const [selectedOfferIds, setSelectedOfferIds] = useState<string[]>([]);
  const [offerRoutesDirty, setOfferRoutesDirty] = useState(false);
  const [attemptedSave, setAttemptedSave] = useState(false);

  useEffect(() => {
    if (!config.isSuccess) return;
    const destination = config.data.destination;
    setForm(
      destination
        ? {
            name: destination.name,
            api_token: '',
            endpoint_url: destination.endpoint_url,
            pixel_id: destination.pixel_id ?? '',
            enabled: destination.enabled,
          }
        : DEFAULT_FORM,
    );
  }, [config.data, config.isSuccess]);

  useEffect(() => {
    if (!config.data || offerRoutesDirty) return;
    setSelectedOfferIds(
      config.data.offers.filter((offer) => offer.enabled).map((offer) => offer.id),
    );
  }, [config.data, offerRoutesDirty]);

  const save = useMutation({
    mutationFn: () =>
      apiClient.saveUtmifyGlobal({
        name: form.name.trim(),
        ...(form.api_token.trim() ? { api_token: form.api_token.trim() } : {}),
        endpoint_url: form.endpoint_url.trim(),
        ...(form.pixel_id.trim() ? { pixel_id: form.pixel_id.trim() } : { pixel_id: null }),
        enabled: form.enabled,
      }),
    onSuccess: () => {
      toast.success(
        'UTMify Geral configurada. As ofertas continuarão enviando também para seus destinos individuais.',
      );
      setAttemptedSave(false);
      setForm((current) => ({ ...current, api_token: '' }));
      void qc.invalidateQueries({ queryKey: ['utmify-global'] });
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : 'Não foi possível salvar a UTMify Geral.',
      ),
  });
  const test = useMutation({
    mutationFn: () => apiClient.testUtmifyGlobal(),
    onSuccess: (result) => toast.success(`Teste enviado: ${result.transaction_id}`),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'A UTMify recusou o teste.'),
  });
  const replay = useMutation({
    mutationFn: () => apiClient.replayUtmifyGlobal(),
    onSuccess: (result) => {
      toast.success(
        `${result.queued} pedido(s) histórico(s) enfileirado(s); ${result.recovered} pendência(s) recuperada(s).`,
      );
      void qc.invalidateQueries({ queryKey: ['utmify-global'] });
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : 'Não foi possível reenviar o histórico.',
      ),
  });
  const saveOfferRoutes = useMutation({
    mutationFn: () => apiClient.saveUtmifyGlobalOffers(selectedOfferIds),
    onSuccess: () => {
      toast.success(
        'Ofertas da UTMify Geral atualizadas. Novos eventos só serão enviados pelas selecionadas.',
      );
      setOfferRoutesDirty(false);
      void qc.invalidateQueries({ queryKey: ['utmify-global'] });
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : 'Não foi possível atualizar as ofertas.',
      ),
  });

  const stats = config.data?.stats;
  const hasPeriodData = Boolean(stats && (stats.orders_7d > 0 || stats.web_events_7d > 0));
  const deliveryRate =
    stats && stats.orders_7d > 0
      ? `${Math.round((stats.orders_delivered_7d / stats.orders_7d) * 100)}%`
      : '0%';
  const nameError = form.name.trim() ? null : 'Informe o nome da dashboard.';
  const tokenError =
    form.api_token.trim() || config.data?.destination?.token_configured
      ? null
      : 'Informe o API Token da UTMify Geral.';
  const pixelError =
    form.pixel_id.trim() && !/^[a-f0-9]{24}$/i.test(form.pixel_id.trim())
      ? 'Use exatamente 24 caracteres hexadecimais.'
      : null;
  const endpointError = form.endpoint_url.trim() ? null : 'Informe o endpoint de pedidos.';
  const hasFormError = Boolean(nameError || tokenError || pixelError || endpointError);

  const handleSave = () => {
    setAttemptedSave(true);
    if (hasFormError) return;
    save.mutate();
  };
  return {
    config,
    form,
    setForm,
    selectedOfferIds,
    setSelectedOfferIds,
    offerRoutesDirty,
    setOfferRoutesDirty,
    attemptedSave,
    save,
    test,
    replay,
    saveOfferRoutes,
    stats,
    hasPeriodData,
    deliveryRate,
    nameError,
    tokenError,
    pixelError,
    endpointError,
    handleSave,
  };
}
