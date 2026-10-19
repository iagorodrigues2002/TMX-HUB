'use client';
import { TRACKING_DASHBOARD_STALE_TIME } from '@/components/tracking/tracking-query';
import { getErrorDataStateProps } from '@/components/ui/data-state';
import { apiClient } from '@/lib/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { useQuery } from '@tanstack/react-query';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useEffect } from 'react';
import { toast } from 'sonner';
export function useVturbIntelligence({
  config,
  offerId,
  from,
  to,
}: {
  config:
    | {
        enabled: boolean;
        endpoint_url?: string;
        player_id?: string;
        comparison_group_id?: string;
        conversion_param?: string;
        analytics_token_configured?: boolean;
        last_validated_at?: string;
        last_error?: string;
      }
    | undefined;
  offerId: string;
  from: string;
  to: string;
}) {
  const qc = useQueryClient();

  const [token, setToken] = useState('');

  const [endpoint, setEndpoint] = useState(config?.endpoint_url ?? '');

  const [playerId, setPlayerId] = useState(config?.player_id ?? '');

  const [comparisonGroupId, setComparisonGroupId] = useState(config?.comparison_group_id ?? '');

  const [conversionParam, setConversionParam] = useState(config?.conversion_param ?? 'vtid');

  useEffect(() => {
    setEndpoint(config?.endpoint_url ?? '');
    setPlayerId(config?.player_id ?? '');
    setComparisonGroupId(config?.comparison_group_id ?? '');
    setConversionParam(config?.conversion_param ?? 'vtid');
  }, [
    config?.endpoint_url,
    config?.player_id,
    config?.comparison_group_id,
    config?.conversion_param,
  ]);

  const players = useQuery({
    queryKey: ['vturb-players', offerId],
    queryFn: () => apiClient.getVturbPlayers(offerId),
    enabled: Boolean(config?.analytics_token_configured),
    retry: 1,
    staleTime: TRACKING_DASHBOARD_STALE_TIME,
  });

  const selectedPlayerId = playerId || config?.player_id || '';

  const selectedComparisonGroupId = comparisonGroupId || config?.comparison_group_id || '';

  const analytics = useQuery({
    queryKey: ['vturb-analytics', offerId, selectedPlayerId, selectedComparisonGroupId, from, to],
    queryFn: () =>
      apiClient.getVturbAnalytics(
        offerId,
        { from, to },
        selectedPlayerId,
        selectedComparisonGroupId,
      ),
    enabled: Boolean(
      config?.analytics_token_configured && (selectedPlayerId || selectedComparisonGroupId),
    ),
    retry: 1,
    staleTime: TRACKING_DASHBOARD_STALE_TIME,
  });

  const save = useMutation({
    mutationFn: () =>
      apiClient.saveVturbIntegration(offerId, {
        enabled: true,
        analytics_api_token: token.trim() || undefined,
        endpoint_url: endpoint.trim(),
        player_id: playerId || null,
        comparison_group_id: comparisonGroupId || null,
        conversion_param: conversionParam,
      }),
    onSuccess: () => {
      setToken('');
      void qc.invalidateQueries({ queryKey: ['tracking-advanced', offerId] });
      void qc.invalidateQueries({ queryKey: ['vturb-players', offerId] });
      toast.success('VTurb validada e vinculada à oferta.');
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const singleAnalytics =
    analytics.data && !('kind' in analytics.data) ? analytics.data : undefined;

  const comparisonAnalytics =
    analytics.data && 'kind' in analytics.data ? analytics.data : undefined;

  const localConversions = singleAnalytics?.tmx_country_conversions ?? [];

  const countries = (singleAnalytics?.countries ?? []).map((country) => {
    const local = localConversions.find(
      (row) => row.country.trim().toLowerCase() === country.grouped_field.trim().toLowerCase(),
    );
    return local
      ? {
          ...country,
          total_conversions: Math.max(
            Number(country.total_conversions ?? 0),
            local.total_conversions,
          ),
          total_amount_brl: Math.max(Number(country.total_amount_brl ?? 0), local.total_amount_brl),
        }
      : country;
  });

  const sum = (field: keyof (typeof countries)[number]) =>
    countries.reduce((total, row) => total + Number(row[field] ?? 0), 0);

  const views = sum('total_viewed_device_uniq');

  const plays = sum('total_started_device_uniq');

  const pitchAudience = sum('total_over_pitch');

  const clicks = sum('total_clicked_device_uniq');

  const conversions = sum('total_conversions');

  const pitchRate = plays ? (pitchAudience / plays) * 100 : 0;

  const curve = singleAnalytics?.engagement?.grouped_timed ?? [];

  const maxCurve = Math.max(1, ...curve.map((point) => point.total_users));

  const queryError = analytics.error ?? players.error;

  const queryErrorState = queryError
    ? getErrorDataStateProps(queryError, {
        title: 'Não foi possível carregar os dados do vTurb',
        suggestion:
          'Tente novamente em alguns segundos. Se persistir, verifique a chave da API em Configurações.',
      })
    : null;
  return {
    qc,
    token,
    setToken,
    endpoint,
    setEndpoint,
    playerId,
    setPlayerId,
    comparisonGroupId,
    setComparisonGroupId,
    conversionParam,
    setConversionParam,
    players,
    selectedPlayerId,
    selectedComparisonGroupId,
    analytics,
    save,
    singleAnalytics,
    comparisonAnalytics,
    localConversions,
    countries,
    sum,
    views,
    plays,
    pitchAudience,
    clicks,
    conversions,
    pitchRate,
    curve,
    maxCurve,
    queryError,
    queryErrorState,
  };
}
