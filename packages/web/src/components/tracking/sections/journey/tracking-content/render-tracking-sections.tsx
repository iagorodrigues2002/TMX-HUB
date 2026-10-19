'use client';
import { GoogleAdsDestinations } from '@/components/tracking/google-ads-destinations';
import { TikTokDestinations } from '@/components/tracking/tiktok-destinations';
import { TrackingHelp } from '@/components/tracking/tracking-help';
import { TrackingLiveConsole } from '@/components/tracking/tracking-live-console';
import { TrackingPanel } from '@/components/tracking/tracking-panel';
import { Button } from '@/components/ui/button';
import { formatMoney } from '@/lib/currency-preference';
import { Module } from './module';
import { renderDomains } from './render-domains';
import { renderFees } from './render-fees';
import { renderGateways } from './render-gateways';
import { renderLinksAndTests } from './render-links-and-tests';
import { renderMetaDelivery } from './render-meta-delivery';
import { renderPushcut } from './render-pushcut';
import { renderTrackingDates } from './render-tracking-dates';
import { renderUpsells } from './render-upsells';
import { renderUtmify } from './render-utmify';
import type { TrackingContentContext } from './tracking-content-context';
import { sections } from './tracking-navigation';
import type { TrackingSectionId } from './tracking-navigation';
import { VturbIntelligence } from './vturb-intelligence';
export function renderTrackingSections(context: TrackingContentContext) {
  const {
    activeArea,
    section,
    setSection,
    config,
    canManage,
    setupTracking,
    trackingFrom,
    trackingTo,
    offerId,
    refunds,
    advanced,
    utmify,
  } = context;
  return (
    <div className="min-w-0">
      {activeArea.sections.length > 1 && (
        <div className="hidden">
          {activeArea.sections.map((id) => {
            const item = sections.find((entry) => entry.id === id);
            if (!item) return null;
            return (
              <Button
                key={id}
                type="button"
                size="sm"
                variant={section === id ? 'default' : 'ghost'}
                className="shrink-0"
                onClick={() => setSection(id)}
              >
                {item.label}
              </Button>
            );
          })}
        </div>
      )}
      {config.isSuccess &&
        config.data &&
        (!config.data?.configured || !config.data?.vendepay?.configured) && (
          <section className="mb-4 rounded-lg border border-cyan-300/25 bg-cyan-300/[0.06] p-5 shadow-[0_0_32px_rgba(34,211,238,.08)]">
            <p className="hud-label text-cyan-200">
              {config.data?.configured
                ? 'Conexão Vendepay incompleta · reparo necessário'
                : 'Oferta nova · configuração necessária'}
            </p>
            <div className="mt-2 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  {config.data?.configured
                    ? 'Gere a conexão e o webhook da Vendepay'
                    : 'Ative o tracking desta oferta'}
                </h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-white/55">
                  O TMX criará o identificador da oferta, o código de instalação e o webhook
                  exclusivo da Vendepay. Depois disso, Pixels, UTMify e testes A/B ficam
                  disponíveis.
                </p>
              </div>
              {canManage && (
                <Button
                  type="button"
                  className="h-11 shrink-0"
                  disabled={setupTracking.isPending}
                  onClick={() => setupTracking.mutate()}
                >
                  {setupTracking.isPending ? 'Criando infraestrutura…' : 'Ativar e gerar webhook'}
                </Button>
              )}
            </div>
          </section>
        )}
      {(['tracker', 'funnel', 'attribution', 'refunds', 'ab'] as TrackingSectionId[]).includes(
        section,
      ) && renderTrackingDates(context)}
      {section === 'tracker' && (
        <TrackingLiveConsole offerId={offerId} mode="tracker" from={trackingFrom} to={trackingTo} />
      )}
      {section === 'funnel' && (
        <TrackingLiveConsole offerId={offerId} mode="funnel" from={trackingFrom} to={trackingTo} />
      )}
      {section === 'upsells' && renderUpsells(context)}
      {section === 'attribution' && (
        <TrackingLiveConsole
          offerId={offerId}
          mode="attribution"
          from={trackingFrom}
          to={trackingTo}
        />
      )}
      {section === 'refunds' && (
        <Module
          title="Reembolsos e chargeback"
          description="Pedidos com status reembolsado ou chargeback no período selecionado, pela data em que o status mudou — não pela data da compra original."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-amber-300/15 bg-amber-300/[0.04] p-4">
              <p className="hud-label text-amber-200/80">Reembolsos</p>
              <p className="mono-num mt-2 text-2xl text-white">
                {formatMoney(refunds.data?.totals.refunded_revenue_brl_minor, 'BRL')}
              </p>
              <p className="mt-1 text-xs text-white/45">
                {refunds.data?.totals.refunded_orders ?? 0} pedido(s)
              </p>
            </div>
            <div className="rounded-lg border border-red-300/15 bg-red-300/[0.04] p-4">
              <p className="hud-label text-red-200/80">Chargeback</p>
              <p className="mono-num mt-2 text-2xl text-white">
                {formatMoney(refunds.data?.totals.chargeback_revenue_brl_minor, 'BRL')}
              </p>
              <p className="mt-1 text-xs text-white/45">
                {refunds.data?.totals.chargeback_orders ?? 0} pedido(s)
              </p>
            </div>
          </div>
          <div className="mt-6 space-y-2">
            {(refunds.data?.items ?? []).map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded border border-white/[0.07] p-3 text-xs"
              >
                <div>
                  <p className="font-mono text-white/70">{item.external_id}</p>
                  <p className="mt-1 text-white/40">
                    {item.buyer?.name ?? item.buyer?.email ?? 'comprador não identificado'} ·{' '}
                    {item.order_kind} ·{' '}
                    {new Date(item.updated_at).toLocaleString('pt-BR', {
                      timeZone: 'America/Sao_Paulo',
                    })}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={item.status === 'chargeback' ? 'text-red-300' : 'text-amber-300'}
                  >
                    {item.status === 'chargeback' ? 'chargeback' : 'reembolsado'}
                  </span>
                  <span className="mono-num text-white/80">
                    {formatMoney(item.amount_brl_minor ?? undefined, 'BRL')}
                  </span>
                </div>
              </div>
            ))}
            {!refunds.data?.items?.length && (
              <p className="rounded border border-dashed border-white/[0.08] p-4 text-sm text-white/35">
                Nenhum reembolso ou chargeback neste dia.
              </p>
            )}
          </div>
        </Module>
      )}
      {(section === 'pixels' || section === 'code') && (
        <TrackingPanel offerId={offerId} canManage={canManage} />
      )}
      {section === 'help' && <TrackingHelp />}
      {section === 'domains' && renderDomains(context)}
      {section === 'gateways' && renderGateways(context)}
      {section === 'meta' && renderMetaDelivery(context)}
      {section === 'google-ads' && (
        <Module
          title="Google Ads"
          description="Contas e ações de conversão independentes por oferta."
        >
          <GoogleAdsDestinations key={offerId} offerId={offerId} />
        </Module>
      )}
      {section === 'tiktok-ads' && (
        <Module
          title="TikTok Ads"
          description="Pixels e Events API independentes por oferta, com teste sem venda real."
        >
          <TikTokDestinations key={offerId} offerId={offerId} />
        </Module>
      )}
      {section === 'utmify' && renderUtmify(context)}
      {section === 'pushcut' && renderPushcut(context)}
      {section === 'fees' && renderFees(context)}
      {(section === 'links' || section === 'ab') && renderLinksAndTests(context)}
      {section === 'vturb' && (
        <Module
          title="VTurb Intelligence"
          description="Retenção da VSL, pitch, países e conversões conectados à oferta."
        >
          <VturbIntelligence
            offerId={offerId}
            canManage={canManage}
            from={trackingFrom}
            to={trackingTo}
            config={advanced.data?.vturb}
          />
        </Module>
      )}
    </div>
  );
}
