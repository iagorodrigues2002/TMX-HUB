'use client';

import { Button } from '@/components/ui/button';
import { DataState } from '@/components/ui/data-state';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { apiClient } from '@/lib/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  Cable,
  CheckCircle2,
  Database,
  History,
  Loader2,
  RefreshCw,
  Send,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

const DEFAULT_FORM = {
  name: 'UTMify Geral',
  api_token: '',
  endpoint_url: 'https://api.utmify.com.br/api-credentials/orders',
  pixel_id: '',
  enabled: true,
};

export function UtmifyGlobalCenter() {
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

  return (
    <div className="signal-reveal space-y-6">
      <header className="tmx-command-hero rounded-2xl border border-cyan-300/15 bg-gradient-to-br from-cyan-300/[0.09] via-white/[0.025] to-transparent p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <div className="mb-4 flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-xl border border-cyan-300/25 bg-cyan-300/[0.08]">
                <Cable className="h-5 w-5 text-cyan-300" />
              </div>
              <div>
                <p className="hud-label">TMX · UTMify Hub</p>
                <p className="mt-1 text-xs text-emerald-200/70">Camada agregadora multi-oferta</p>
              </div>
            </div>
            <h1 className="text-3xl font-bold text-white md:text-4xl">UTMify Geral</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/50">
              Uma segunda camada recebe pedidos e InitiateCheckout de todas as ofertas, sem
              substituir ou misturar as integrações individuais.
            </p>
          </div>
          <Button
            variant="outline"
            disabled={config.isFetching}
            onClick={() => void config.refetch()}
            className="gap-2 border-white/10"
          >
            <RefreshCw className={config.isFetching ? 'animate-spin' : ''} />
            {config.isFetching ? 'Atualizando' : 'Atualizar'}
          </Button>
        </div>
      </header>

      {config.isLoading ? (
        <UtmifyLoadingState />
      ) : config.isError && !config.data ? (
        <DataState
          variant="error"
          title="Não foi possível carregar a UTMify Geral"
          description="A configuração não foi liberada para edição porque os dados atuais não puderam ser confirmados."
          isRetrying={config.isFetching}
          onRetry={() => void config.refetch()}
        />
      ) : config.data ? (
        <>
          {config.isError && (
            <output
              aria-live="polite"
              className="block rounded-xl border border-warning/25 bg-warning/[0.07] px-4 py-3 text-sm text-warning"
            >
              Não foi possível atualizar agora. Exibindo a última configuração carregada.
            </output>
          )}

          {hasPeriodData && stats ? (
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard icon={Database} label="Pedidos · 7 dias" value={stats.orders_7d} />
              <MetricCard icon={CheckCircle2} label="Entregues" value={stats.orders_delivered_7d} />
              <MetricCard
                icon={Activity}
                label="Eventos web"
                value={stats.web_events_delivered_7d}
              />
              <MetricCard
                icon={stats.orders_failed_7d ? TriangleAlert : ShieldCheck}
                label="Saúde de envio"
                value={deliveryRate}
              />
            </section>
          ) : (
            <DataState
              variant="empty"
              title="Sem dados no período"
              description="Nenhum pedido ou evento web foi entregue pela UTMify Geral nos últimos 7 dias."
            />
          )}

          <form
            className="rounded-2xl border border-cyan-300/15 bg-bg-elevated/90 p-5 sm:p-6"
            onSubmit={(event) => {
              event.preventDefault();
              handleSave();
            }}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-white">Destino agregador</h2>
                <p className="mt-1 text-xs leading-5 text-white/40">
                  Use o token e o Pixel ID pertencentes à dashboard geral da UTMify.
                </p>
              </div>
              <label className="flex min-h-11 cursor-pointer items-center gap-2 text-xs text-white/60">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(event) => setForm({ ...form, enabled: event.target.checked })}
                  className="h-4 w-4 accent-cyan-300"
                />
                Integração ativa
              </label>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <FormField
                id="utmify-global-name"
                label="Nome da dashboard"
                error={attemptedSave ? nameError : null}
              >
                <Input
                  id="utmify-global-name"
                  value={form.name}
                  aria-invalid={attemptedSave && Boolean(nameError)}
                  aria-describedby={
                    attemptedSave && nameError ? 'utmify-global-name-error' : undefined
                  }
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                />
              </FormField>
              <FormField
                id="utmify-global-token"
                label="API Token"
                help={
                  config.data.destination?.token_configured
                    ? 'Token salvo. Deixe em branco para manter o atual.'
                    : 'Token da dashboard geral da UTMify.'
                }
                error={attemptedSave ? tokenError : null}
              >
                <Input
                  id="utmify-global-token"
                  type="password"
                  autoComplete="new-password"
                  value={form.api_token}
                  aria-invalid={attemptedSave && Boolean(tokenError)}
                  aria-describedby={
                    attemptedSave && tokenError
                      ? 'utmify-global-token-error'
                      : 'utmify-global-token-help'
                  }
                  onChange={(event) => setForm({ ...form, api_token: event.target.value })}
                />
              </FormField>
              <FormField
                id="utmify-global-pixel"
                label="Pixel ID geral"
                help="Opcional. Use 24 caracteres hexadecimais."
                error={attemptedSave ? pixelError : null}
              >
                <Input
                  id="utmify-global-pixel"
                  value={form.pixel_id}
                  className="font-mono"
                  aria-invalid={attemptedSave && Boolean(pixelError)}
                  aria-describedby={
                    attemptedSave && pixelError
                      ? 'utmify-global-pixel-error'
                      : 'utmify-global-pixel-help'
                  }
                  onChange={(event) => setForm({ ...form, pixel_id: event.target.value })}
                />
              </FormField>
              <FormField
                id="utmify-global-endpoint"
                label="Endpoint de pedidos"
                error={attemptedSave ? endpointError : null}
              >
                <Input
                  id="utmify-global-endpoint"
                  type="url"
                  value={form.endpoint_url}
                  aria-invalid={attemptedSave && Boolean(endpointError)}
                  aria-describedby={
                    attemptedSave && endpointError ? 'utmify-global-endpoint-error' : undefined
                  }
                  onChange={(event) => setForm({ ...form, endpoint_url: event.target.value })}
                />
              </FormField>
            </div>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => replay.mutate()}
                disabled={!config.data.configured || replay.isPending}
                className="gap-2 border-white/10"
              >
                {replay.isPending ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <History className="h-4 w-4" />
                )}
                {replay.isPending ? 'Reenviando…' : 'Reenviar histórico'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => test.mutate()}
                disabled={!config.data.configured || test.isPending}
                className="gap-2 border-white/10"
              >
                {test.isPending ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {test.isPending ? 'Enviando…' : 'Enviar pedido teste'}
              </Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending && <Loader2 className="animate-spin" />}
                {save.isPending ? 'Salvando…' : 'Salvar UTMify Geral'}
              </Button>
            </div>
          </form>

          <section className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="font-semibold text-white">Ofertas enviadas à dashboard geral</h2>
                <p className="mt-1 max-w-2xl text-xs leading-5 text-white/45">
                  Escolha quais ofertas podem enviar pedidos e eventos de checkout para esta UTMify
                  Geral. As integrações individuais de cada oferta continuam independentes.
                </p>
              </div>
              <p className="rounded-full border border-cyan-300/20 bg-cyan-300/[0.07] px-3 py-1 font-mono text-xs text-cyan-100">
                {selectedOfferIds.length} de {config.data.offers.length} selecionadas
              </p>
            </div>
            {!config.data.offers.length ? (
              <p className="mt-5 text-sm text-white/40">
                Nenhuma oferta com tracking ativo foi encontrada.
              </p>
            ) : (
              <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {config.data.offers.map((offer) => {
                  const checked = selectedOfferIds.includes(offer.id);
                  return (
                    <label
                      key={offer.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${checked ? 'border-cyan-300/35 bg-cyan-300/[0.07]' : 'border-white/[0.08] bg-black/10 hover:border-white/20'}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setOfferRoutesDirty(true);
                          setSelectedOfferIds((current) =>
                            checked
                              ? current.filter((offerId) => offerId !== offer.id)
                              : [...current, offer.id],
                          );
                        }}
                        className="h-4 w-4 accent-cyan-300"
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-white">
                          {offer.company_name || 'Empresa não cadastrada'}
                        </span>
                        <span className="block truncate text-[11px] text-white/50">
                          {offer.name}
                        </span>
                        <span className="block truncate font-mono text-[10px] text-white/30">
                          {offer.id}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
            <div className="mt-4 flex justify-end">
              <Button
                type="button"
                onClick={() => saveOfferRoutes.mutate()}
                disabled={saveOfferRoutes.isPending || !offerRoutesDirty}
              >
                {saveOfferRoutes.isPending && <Loader2 className="animate-spin" />}
                {saveOfferRoutes.isPending ? 'Salvando…' : 'Salvar ofertas selecionadas'}
              </Button>
            </div>
          </section>

          <section className="rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.035] p-5 text-sm leading-6 text-white/55">
            <p className="flex items-center gap-2 font-medium text-emerald-200">
              <ShieldCheck className="h-4 w-4" /> Roteamento em paralelo e com filtro
            </p>
            <p className="mt-2">
              Oferta selecionada → UTMify individual da oferta{' '}
              <span className="text-white/25">+</span> UTMify Geral. Ofertas desmarcadas continuam
              no TMX e em seus destinos individuais, mas deixam de enviar dados novos à dashboard
              geral.
            </p>
          </section>
        </>
      ) : null}
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Database;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
      <Icon className="h-4 w-4 text-cyan-300" />
      <p className="mt-4 font-mono text-2xl tabular-nums text-white">{value}</p>
      <p className="mt-1 text-[10px] uppercase tracking-[0.15em] text-white/35">{label}</p>
    </div>
  );
}

function UtmifyLoadingState() {
  const skeletons = ['pedidos', 'entregues', 'eventos', 'saude'];

  return (
    <output
      aria-live="polite"
      aria-label="Carregando configuração da UTMify Geral"
      className="block"
    >
      <section className="grid animate-pulse gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {skeletons.map((skeleton) => (
          <div
            key={skeleton}
            className="h-28 rounded-xl border border-white/[0.08] bg-white/[0.025]"
          />
        ))}
      </section>
      <div className="mt-6 h-72 animate-pulse rounded-2xl border border-white/[0.08] bg-white/[0.025]" />
    </output>
  );
}
