'use client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Module } from './module';
import { renderProductKinds } from './render-product-kinds';
import { renderUtmifyWebEvents } from './render-utmify-web-events';
import type { TrackingContentContext } from './tracking-content-context';
export function renderUtmify(context: TrackingContentContext) {
  const {
    utmifyPixel,
    canManage,
    utmifyPixelId,
    setUtmifyPixelId,
    saveUtmifyPixel,
    utmify,
    toggleUtmify,
    reconcileUtmifyFront,
    utmifyToken,
    setUtmifyToken,
    saveUtmify,
    utmifyEndpoint,
    setUtmifyEndpoint,
    testUtmifyCheckout,
    utmifyDeliveries,
    retryUtmify,
  } = context;
  return (
    <Module
      title="Envio à UTMify"
      description="Envia ICs ao Pixel UTMify e replica mudanças dos pedidos na API de vendas, com filas auditáveis separadas."
    >
      <div className="mb-5 rounded border border-cyan-400/20 bg-cyan-400/[0.04] p-4">
        <p className="text-sm font-medium text-cyan-100">Pixel UTMify para PageView e IC</p>
        <p className="mt-1 text-xs leading-5 text-white/45">
          Use o ID de 24 caracteres exibido em UTMify → Integrações → Pixel. Não use o ID numérico
          do Pixel Meta.
        </p>
        <p className="mt-2 font-mono text-xs text-white/65">
          Atual: {utmifyPixel.data?.pixel_id ?? 'não configurado'}
        </p>
        {canManage && (
          <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
            <Input
              value={utmifyPixelId}
              onChange={(event) => setUtmifyPixelId(event.target.value)}
              placeholder="Ex.: 6a698a76093cf4ea09039541"
              maxLength={24}
            />
            <Button
              disabled={!/^[a-f0-9]{24}$/i.test(utmifyPixelId.trim()) || saveUtmifyPixel.isPending}
              onClick={() => saveUtmifyPixel.mutate()}
            >
              Salvar Pixel UTMify
            </Button>
          </div>
        )}
      </div>
      <div className="mb-5 flex items-center justify-between rounded border border-white/[0.07] p-4">
        <div>
          <p className="text-sm text-white/75">Destino de vendas</p>
          <p className="mt-1 text-xs text-white/40">
            {utmify.data?.configured
              ? `${utmify.data.destination?.enabled ? 'Ativo' : 'Pausado'} · ${utmify.data.destination?.endpoint_url}`
              : 'Ainda não configurado'}
          </p>
        </div>
        {utmify.data?.configured && canManage ? (
          <button
            type="button"
            role="switch"
            aria-checked={Boolean(utmify.data.destination?.enabled)}
            aria-label="Ativar envio de vendas para a UTMify"
            disabled={toggleUtmify.isPending}
            onClick={() => toggleUtmify.mutate(!utmify.data?.destination?.enabled)}
            className={cn(
              'flex items-center gap-2 rounded-full border px-2 py-1 text-xs transition disabled:cursor-wait disabled:opacity-60',
              utmify.data.destination?.enabled
                ? 'border-emerald-300/35 bg-emerald-300/[0.1] text-emerald-200'
                : 'border-amber-300/30 bg-amber-300/[0.08] text-amber-100',
            )}
          >
            <span
              className={cn(
                'h-4 w-7 rounded-full p-0.5 transition-colors',
                utmify.data.destination?.enabled ? 'bg-emerald-400/80' : 'bg-white/20',
              )}
            >
              <span
                className={cn(
                  'block h-3 w-3 rounded-full bg-white shadow transition-transform',
                  utmify.data.destination?.enabled ? 'translate-x-3' : 'translate-x-0',
                )}
              />
            </span>
            {utmify.data.destination?.enabled ? 'Envio ativo' : 'Envio pausado'}
          </button>
        ) : (
          <span
            className={utmify.data?.destination?.enabled ? 'text-emerald-300' : 'text-amber-300'}
          >
            {utmify.data?.destination?.enabled ? 'operacional' : 'envio pausado'}
          </span>
        )}
      </div>
      {canManage && utmify.data?.destination?.enabled && (
        <div className="mb-5 rounded border border-emerald-400/20 bg-emerald-400/[0.04] p-4">
          <p className="text-sm font-medium text-emerald-100">Atribuição das vendas front</p>
          <p className="mt-1 text-xs leading-5 text-white/45">
            Recupera campanha, conjunto e anúncio da jornada original e atualiza na UTMify as
            compras já recebidas. Use após corrigir UTMs ou divergências de campanha.
          </p>
          <Button
            className="mt-3"
            variant="outline"
            disabled={reconcileUtmifyFront.isPending}
            onClick={() => reconcileUtmifyFront.mutate()}
          >
            {reconcileUtmifyFront.isPending
              ? 'Reconciliando vendas...'
              : 'Corrigir campanhas das vendas front'}
          </Button>
        </div>
      )}
      {canManage && (
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <Input
            value={utmifyToken}
            onChange={(event) => setUtmifyToken(event.target.value)}
            type="password"
            autoComplete="off"
            placeholder="Token de API da UTMify"
          />
          <Button
            disabled={utmifyToken.trim().length < 16 || saveUtmify.isPending}
            onClick={() => saveUtmify.mutate()}
          >
            {utmify.data?.configured ? 'Atualizar conexão' : 'Conectar UTMify'}
          </Button>
          <Input
            className="md:col-span-2"
            value={utmifyEndpoint}
            onChange={(event) => setUtmifyEndpoint(event.target.value)}
            placeholder="Endpoint da API de vendas"
          />
          <div className="md:col-span-2 rounded border border-cyan-400/20 bg-cyan-400/[0.04] p-4">
            <p className="text-sm font-medium text-cyan-100">Testar checkout pendente</p>
            <p className="mt-1 text-xs leading-5 text-white/45">
              Envia um pedido de R$ 1,00 com status waiting_payment e isTest=true. Ele valida a
              conexão sem registrar uma venda aprovada.
            </p>
            <Button
              className="mt-3"
              variant="outline"
              disabled={!utmify.data?.destination?.enabled || testUtmifyCheckout.isPending}
              onClick={() => testUtmifyCheckout.mutate()}
            >
              {testUtmifyCheckout.isPending
                ? 'Enviando checkout de teste...'
                : 'Enviar checkout de teste'}
            </Button>
          </div>
        </div>
      )}
      {renderUtmifyWebEvents(context)}
      <div className="mt-6">
        <p className="hud-label">Últimas entregas de pedidos</p>
        <div className="mt-3 space-y-2">
          {(utmifyDeliveries.data?.deliveries ?? []).slice(0, 20).map((delivery) => (
            <div
              key={delivery.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded border border-white/[0.07] p-3 text-xs"
            >
              <div>
                <p className="font-mono text-white/70">{delivery.transaction_id}</p>
                <p className="mt-1 text-white/35">
                  {delivery.event_type} · {delivery.attempts} tentativa(s)
                </p>
                {delivery.last_error && (
                  <p className="mt-1 max-w-2xl break-words text-red-200/70">
                    {delivery.last_error}
                  </p>
                )}
                {delivery.response && (
                  <details className="mt-2 max-w-2xl text-white/40">
                    <summary className="flex min-h-11 cursor-pointer items-center text-xs font-medium text-white/55 hover:text-white/75">
                      Ver recibo técnico da UTMify
                    </summary>
                    <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded border border-white/[0.07] bg-black/20 p-3 font-mono text-[10px] leading-4 text-white/45">
                      {JSON.stringify(delivery.response, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={
                    delivery.state === 'delivered'
                      ? 'text-emerald-300'
                      : delivery.state === 'failed' || delivery.state === 'dead'
                        ? 'text-red-300'
                        : 'text-amber-300'
                  }
                >
                  {delivery.state}
                </span>
                {canManage && (delivery.state === 'failed' || delivery.state === 'dead') && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => retryUtmify.mutate(delivery.id)}
                  >
                    Reenviar
                  </Button>
                )}
              </div>
            </div>
          ))}
          {!utmifyDeliveries.data?.deliveries?.length && (
            <p className="rounded border border-dashed border-white/[0.08] p-4 text-sm text-white/35">
              As entregas aparecerão aqui quando o primeiro pedido for recebido.
            </p>
          )}
        </div>
      </div>
      {renderProductKinds(context)}
    </Module>
  );
}
