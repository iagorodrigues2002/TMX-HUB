'use client';
import { Button } from '@/components/ui/button';
import { DataState } from '@/components/ui/data-state';
import { Input } from '@/components/ui/input';
import { formatMoney } from '@/lib/currency-preference';
import { cn } from '@/lib/utils';
import { Activity } from 'lucide-react';
import { Metric } from './metric';
import { renderVturbAnalytics } from './render-vturb-analytics';
import { formatDuration } from './tracking-helpers';
import { useVturbIntelligence } from './use-vturb-intelligence';
export function VturbIntelligence({
  offerId,
  canManage,
  from,
  to,
  config,
}: {
  offerId: string;
  canManage: boolean;
  from: string;
  to: string;
  config?: {
    enabled: boolean;
    endpoint_url?: string;
    player_id?: string;
    comparison_group_id?: string;
    conversion_param?: string;
    analytics_token_configured?: boolean;
    last_validated_at?: string;
    last_error?: string;
  };
}) {
  const state0 = useVturbIntelligence({ config: config, offerId: offerId, from: from, to: to });
  const {
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
    countries,
    views,
    plays,
    clicks,
    conversions,
    pitchRate,
    curve,
    maxCurve,
    queryErrorState,
  } = state0;

  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-2xl border border-cyan-300/20 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.12),transparent_38%),linear-gradient(135deg,var(--tmx-hero-start),var(--tmx-hero-end))] p-5">
        <div className="absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(34,211,238,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,.08)_1px,transparent_1px)] [background-size:24px_24px]" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-cyan-200">
              <Activity size={17} />
              <span className="text-[10px] font-semibold uppercase tracking-[.28em]">
                VTurb Intelligence
              </span>
            </div>
            <h3 className="mt-2 text-xl font-semibold text-white">
              A VSL conectada à receita da oferta
            </h3>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-white/48">
              Descubra onde o público abandona, quantos chegam ao pitch e quais países transformam
              atenção em venda.
            </p>
          </div>
          <div
            className={cn(
              'rounded-full border px-3 py-1.5 text-xs',
              config?.last_error
                ? 'border-rose-300/30 bg-rose-300/10 text-rose-200'
                : config?.analytics_token_configured
                  ? 'border-emerald-300/30 bg-emerald-300/10 text-emerald-200'
                  : 'border-amber-300/30 bg-amber-300/10 text-amber-200',
            )}
          >
            {config?.last_error
              ? 'Integração com alerta'
              : config?.analytics_token_configured
                ? 'API conectada'
                : 'Configuração necessária'}
          </div>
        </div>
      </div>

      {canManage && (
        <div className="grid gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4 lg:grid-cols-2">
          <label
            className="text-[10px] uppercase tracking-wider text-white/40"
            htmlFor="vturb-analytics-token"
          >
            Chave da API Analytics
            <Input
              id="vturb-analytics-token"
              className="mt-2"
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder={
                config?.analytics_token_configured
                  ? '•••••••• salva — preencha apenas para trocar'
                  : 'Cole a chave da VTurb'
              }
            />
          </label>
          <label className="text-[10px] uppercase tracking-wider text-white/40">
            VSL ou teste A/B desta oferta
            <select
              className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#071820] px-3 text-sm text-white outline-none focus:border-cyan-300/50"
              value={
                comparisonGroupId
                  ? `group:${comparisonGroupId}`
                  : playerId
                    ? `player:${playerId}`
                    : ''
              }
              onChange={(event) => {
                const [kind, id] = event.target.value.split(':', 2);
                setPlayerId(kind === 'player' ? (id ?? '') : '');
                setComparisonGroupId(kind === 'group' ? (id ?? '') : '');
              }}
            >
              <option value="">Selecione uma VSL ou teste A/B</option>
              <optgroup label="VSLs">
                {players.data?.players.map((player) => (
                  <option key={player.id} value={`player:${player.id}`}>
                    {player.name} · pitch {formatDuration(player.pitch_time)}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Testes A/B da VTurb">
                {players.data?.comparison_groups.map((group) => (
                  <option key={group.id} value={`group:${group.id}`}>
                    {group.name} · {group.player_ids.length} variantes
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
          <label
            className="text-[10px] uppercase tracking-wider text-white/40"
            htmlFor="vturb-conversion-webhook"
          >
            Webhook de conversão gerado pela VTurb
            <Input
              id="vturb-conversion-webhook"
              className="mt-2"
              value={endpoint}
              onChange={(event) => setEndpoint(event.target.value)}
              placeholder="https://tracker.vturb.com/conversions/make?t=..."
            />
          </label>
          <label className="text-[10px] uppercase tracking-wider text-white/40">
            Parâmetro da Conversion Key
            <select
              className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#071820] px-3 text-sm text-white outline-none focus:border-cyan-300/50"
              value={conversionParam}
              onChange={(event) => setConversionParam(event.target.value)}
            >
              {[
                'vtid',
                'sck',
                'sid',
                'src',
                'subid',
                'xcod',
                ...Array.from({ length: 20 }, (_, index) => `sub${index + 1}`),
              ].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <div className="lg:col-span-2 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cyan-300/10 bg-cyan-300/[0.035] p-3 text-xs text-white/45">
            <span>
              O mesmo parâmetro deve ser selecionado no rastreamento da VTurb. O TMX preserva a
              chave <code className="text-cyan-200">v3_…</code> até o webhook. Em um teste A/B, ela
              identifica automaticamente a variante que gerou a venda.
            </span>
            <Button
              onClick={() => save.mutate()}
              disabled={save.isPending || (!token.trim() && !config?.analytics_token_configured)}
            >
              {save.isPending ? 'Validando…' : 'Validar e salvar'}
            </Button>
          </div>
        </div>
      )}

      {comparisonAnalytics && (
        <div className="overflow-hidden rounded-2xl border border-violet-300/20 bg-violet-300/[0.035]">
          <div className="border-b border-violet-300/10 p-4">
            <p className="text-sm font-medium text-violet-100">
              Teste A/B · {comparisonAnalytics.comparison_group.name}
            </p>
            <p className="mt-1 text-xs text-white/45">
              Métricas por variante retornadas pela VTurb para o período selecionado.
            </p>
          </div>
          <div className="grid gap-px bg-violet-300/10 md:grid-cols-2">
            {(comparisonAnalytics.stats.stats ?? []).map((stat) => {
              const player = players.data?.players.find((item) => item.id === stat.player_id);
              const revenue = Number(stat.conversions?.total_amount_brl ?? 0);
              return (
                <div key={stat.player_id} className="bg-[#06151b]/90 p-4">
                  <p className="text-sm font-medium text-white/85">
                    {player?.name ?? `VSL ${stat.player_id}`}
                  </p>
                  <p className="mt-1 text-xs text-white/40">
                    Pitch {formatDuration(stat.pitch_time)}
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                    <Metric
                      label="Plays"
                      value={Number(stat.plays?.total_uniq_device ?? 0).toLocaleString('pt-BR')}
                    />
                    <Metric
                      label="Conversões"
                      value={Number(stat.conversions?.total ?? 0).toLocaleString('pt-BR')}
                    />
                    <Metric
                      label="Conversão"
                      value={`${Number(stat.conversion_rate ?? 0).toFixed(2)}%`}
                    />
                    <Metric
                      label="Receita"
                      value={revenue ? formatMoney(revenue * 100, 'BRL') : '—'}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {selectedPlayerId &&
        !selectedComparisonGroupId &&
        renderVturbAnalytics({
          views,
          plays,
          singleAnalytics,
          pitchRate,
          clicks,
          conversions,
          curve,
          maxCurve,
          countries,
        })}
      {analytics.isLoading && (
        <div className="rounded-xl border border-cyan-300/10 p-6 text-center text-sm text-cyan-100/55">
          Sincronizando inteligência da VSL…
        </div>
      )}
      {queryErrorState && (
        <DataState
          className="min-h-48"
          variant="error"
          {...queryErrorState}
          isRetrying={analytics.isFetching || players.isFetching}
          onRetry={() => {
            if (analytics.isError) void analytics.refetch();
            if (players.isError) void players.refetch();
          }}
        />
      )}
    </div>
  );
}
