'use client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ExplodelyGatewaySettings } from '@page-cloner/shared';
import type { TrackingContentContext } from './tracking-content-context';
import type { GatewayPlatform } from './tracking-gateway-config';
import { GATEWAY_PLATFORM_LABELS } from './tracking-gateway-config';
export function renderGatewayForm(context: TrackingContentContext) {
  const {
    advanced,
    canManage,
    config,
    gatewayPlatform,
    setGatewayPlatform,
    setGatewayCreatedWebhook,
    setGatewayFormError,
    gatewayName,
    setGatewayName,
    explodelyVendorId,
    createGateway,
    setExplodelyVendorId,
    explodelySellerId,
    setExplodelySellerId,
    explodelyCurrency,
    setExplodelyCurrency,
    explodelyAmountUnit,
    setExplodelyAmountUnit,
    explodelyAmountScale,
    setExplodelyAmountScale,
    gatewayFormError,
    gatewayCreatedWebhook,
  } = context;
  return (
    <div className="mb-5 rounded-lg border border-violet-300/20 bg-violet-300/[0.04] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="hud-label text-violet-200">Gateways universais</p>
          <p className="mt-1 text-xs leading-5 text-white/50">
            Use esta camada para Paysight, Explodely e próximos processadores. A VendePay abaixo
            continua independente e não é alterada.
          </p>
        </div>
      </div>
      {(advanced.data?.gateways ?? [])
        .filter((gateway) => gateway.provider !== 'vendepay')
        .map((gateway) => (
          <div
            key={gateway.id ?? gateway.provider}
            className="mt-3 flex items-center justify-between rounded border border-white/[0.08] bg-black/15 px-3 py-2 text-xs"
          >
            <span className="text-white/75">{gateway.name ?? gateway.provider}</span>
            <span className={gateway.enabled ? 'text-emerald-200' : 'text-white/40'}>
              {gateway.last_webhook_at
                ? 'webhook ativo'
                : gateway.enabled
                  ? 'aguardando webhook'
                  : 'pausado'}
            </span>
          </div>
        ))}
      {canManage && config.data?.configured && (
        <div className="mt-4 border-t border-violet-300/15 pt-4">
          <p className="hud-label text-violet-200">Nova conexão</p>
          <p className="mt-1 text-xs text-white/45">
            1. Escolha a plataforma · 2. Dê um nome interno · 3. Salve e receba o webhook exclusivo.
          </p>
          <div className="mt-3 grid gap-2 md:grid-cols-[220px_minmax(0,1fr)_auto]">
            <select
              aria-label="Plataforma de pagamento"
              value={gatewayPlatform}
              onChange={(event) => {
                setGatewayPlatform(event.target.value as GatewayPlatform);
                setGatewayCreatedWebhook('');
                setGatewayFormError('');
              }}
              className="h-10 rounded-md border border-white/[0.1] bg-[#071720] px-3 text-sm text-white"
            >
              <option value="vendepay">VendePay</option>
              <option value="paysight">Paysight</option>
              <option value="explodely">Explodely</option>
            </select>
            <Input
              aria-label="Nome interno da conexão"
              value={gatewayName}
              onChange={(event) => {
                setGatewayName(event.target.value);
                setGatewayFormError('');
              }}
              placeholder={`Ex.: ${GATEWAY_PLATFORM_LABELS[gatewayPlatform]} · Conta do Yola`}
            />
            <Button
              disabled={
                gatewayName.trim().length < 2 ||
                (gatewayPlatform === 'explodely' && !explodelyVendorId.trim()) ||
                createGateway.isPending
              }
              onClick={() => createGateway.mutate()}
            >
              {createGateway.isPending ? 'Criando…' : 'Criar e gerar webhook'}
            </Button>
          </div>
          {gatewayPlatform === 'explodely' && (
            <div className="mt-3 rounded border border-white/[0.08] bg-black/15 p-3">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <label className="space-y-1 lg:col-span-2" htmlFor="explodely-vendor-id">
                  <span className="text-xs text-white/55">Vendor ID</span>
                  <Input
                    id="explodely-vendor-id"
                    required
                    value={explodelyVendorId}
                    onChange={(event) => {
                      setExplodelyVendorId(event.target.value);
                      setGatewayFormError('');
                    }}
                    placeholder="ID do vendor"
                  />
                </label>
                <label className="space-y-1 lg:col-span-2" htmlFor="explodely-seller-id">
                  <span className="text-xs text-white/55">Seller ID (opcional)</span>
                  <Input
                    id="explodely-seller-id"
                    value={explodelySellerId}
                    onChange={(event) => {
                      setExplodelySellerId(event.target.value);
                      setGatewayFormError('');
                    }}
                    placeholder="Alias do seller"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-white/55">Moeda</span>
                  <select
                    value={explodelyCurrency}
                    onChange={(event) =>
                      setExplodelyCurrency(
                        event.target.value as ExplodelyGatewaySettings['currency'],
                      )
                    }
                    className="h-10 w-full rounded-md border border-white/[0.1] bg-[#071720] px-3 text-sm text-white"
                  >
                    <option value="USD">USD</option>
                    <option value="BRL">BRL</option>
                    <option value="EUR">EUR</option>
                  </select>
                </label>
                <label className="space-y-1 lg:col-span-2">
                  <span className="text-xs text-white/55">Unidade do valor</span>
                  <select
                    value={explodelyAmountUnit}
                    onChange={(event) =>
                      setExplodelyAmountUnit(
                        event.target.value as ExplodelyGatewaySettings['amount_unit'],
                      )
                    }
                    className="h-10 w-full rounded-md border border-white/[0.1] bg-[#071720] px-3 text-sm text-white"
                  >
                    <option value="cents">Centavos</option>
                    <option value="decimal">Decimal</option>
                  </select>
                </label>
                <label className="space-y-1 lg:col-span-2" htmlFor="explodely-amount-scale">
                  <span className="text-xs text-white/55">Divisor do valor</span>
                  <Input
                    id="explodely-amount-scale"
                    type="number"
                    inputMode="numeric"
                    min="1"
                    step="1"
                    value={explodelyAmountScale}
                    onChange={(event) => {
                      setExplodelyAmountScale(event.target.value);
                      setGatewayFormError('');
                    }}
                  />
                </label>
              </div>
              <p className="mt-3 text-xs leading-5 text-white/45">
                Encontre o vendor_id no painel Explodely em Settings → Webhooks.
              </p>
              {/* TODO: persist require_signature and webhook_secret per tenant. */}
              <p className="mt-1 text-xs leading-5 text-white/35">
                A assinatura ainda usa EXPLODELY_REQUIRE_SIGNATURE e EXPLODELY_WEBHOOK_SECRET
                globais; configuração por conexão fica para uma próxima etapa.
              </p>
            </div>
          )}
          {gatewayFormError && (
            <p className="mt-2 text-xs text-red-300" role="alert">
              {gatewayFormError}
            </p>
          )}
          {gatewayCreatedWebhook && (
            <div className="mt-3 rounded border border-amber-300/25 bg-amber-300/[0.05] p-3 text-xs">
              <p className="font-medium text-amber-100">
                Webhook pronto para cadastrar na {GATEWAY_PLATFORM_LABELS[gatewayPlatform]}
              </p>
              <code className="mt-2 block break-all text-cyan-100">{gatewayCreatedWebhook}</code>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
