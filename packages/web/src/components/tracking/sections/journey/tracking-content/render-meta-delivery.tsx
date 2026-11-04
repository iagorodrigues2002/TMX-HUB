'use client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { RefreshCw } from 'lucide-react';
import { Send } from 'lucide-react';
import { Module } from './module';
import type { TrackingContentContext } from './tracking-content-context';
export function renderMetaDelivery(context: TrackingContentContext) {
  const {
    attributedOnly,
    setAttributedOnly,
    minimum,
    setMinimum,
    canManage,
    saveRules,
    replayMetaEvents,
    reconcileMetaPurchases,
    metaDeliveries,
  } = context;
  return (
    <Module
      title="Envio ao Meta"
      description="Audite cada IC e venda enviados pela Conversions API, incluindo a confirmação real da Meta e os sinais usados na atribuição."
    >
      <label className="flex items-center gap-3 text-sm text-muted-foreground">
        <input
          type="checkbox"
          checked={attributedOnly}
          onChange={(e) => setAttributedOnly(e.target.checked)}
        />{' '}
        Enviar somente vendas atribuídas ao funil
      </label>
      <label htmlFor="tracking-meta-minimum" className="mt-4 block text-xs text-muted-foreground">
        Valor mínimo da compra (R$)
      </label>
      <Input
        id="tracking-meta-minimum"
        className="mt-2 max-w-xs"
        value={minimum}
        onChange={(e) => setMinimum(e.target.value)}
        inputMode="decimal"
      />
      {canManage && (
        <Button className="mt-4" onClick={() => saveRules.mutate()}>
          Salvar regras
        </Button>
      )}
      <div className="mt-7 border-t border-border pt-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="hud-label">Confirmações da Conversions API</p>
            <p className="mt-2 max-w-3xl text-xs leading-5 text-muted-foreground">
              “Confirmado” exige <span className="font-mono">events_received ≥ 1</span>. Para
              atribuir o evento à campanha, o IC real deve carregar principalmente fbc ou fbclid,
              além do identificador do navegador fbp.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canManage && (
              <Button
                size="sm"
                variant="outline"
                disabled={replayMetaEvents.isPending}
                onClick={() => replayMetaEvents.mutate()}
              >
                <RefreshCw
                  className={cn('mr-2 h-3.5 w-3.5', replayMetaEvents.isPending && 'animate-spin')}
                />
                Reenviar PageView, IC e compras front
              </Button>
            )}
            {canManage && (
              <Button
                size="sm"
                variant="outline"
                disabled={reconcileMetaPurchases.isPending}
                onClick={() => reconcileMetaPurchases.mutate()}
              >
                <Send className="mr-2 h-3.5 w-3.5" />
                Reconciliar compras
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              disabled={metaDeliveries.isFetching}
              onClick={() => void metaDeliveries.refetch()}
            >
              <RefreshCw
                className={cn('mr-2 h-3.5 w-3.5', metaDeliveries.isFetching && 'animate-spin')}
              />
              Atualizar entregas
            </Button>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          {(metaDeliveries.data?.deliveries ?? []).slice(0, 30).map((delivery) => {
            const confirmed = delivery.state === 'delivered' && delivery.provider_event_count > 0;
            return (
              <div key={delivery.id} className="rounded border border-border bg-accent p-3 text-xs">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-muted-foreground">
                      {delivery.event_name} · {delivery.event_id}
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      Pixel {delivery.pixel_id} · {delivery.attempts} tentativa(s)
                      {delivery.response_status ? ` · HTTP ${delivery.response_status}` : ''}
                    </p>
                  </div>
                  <span
                    className={
                      confirmed
                        ? 'text-success'
                        : delivery.state === 'failed'
                          ? 'text-danger'
                          : 'text-warning'
                    }
                  >
                    {confirmed ? `${delivery.provider_event_count} confirmado(s)` : delivery.state}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {[
                    ['fbclid', delivery.has_fbclid],
                    ['fbc', delivery.has_fbc],
                    ['fbp', delivery.has_fbp],
                    ['campanha', Boolean(delivery.campaign_id)],
                    ['conjunto', Boolean(delivery.adset_id)],
                    ['anúncio', Boolean(delivery.ad_id)],
                  ].map(([label, available]) => (
                    <span
                      key={String(label)}
                      className={cn(
                        'rounded-full border px-2 py-1 font-mono text-[10px]',
                        available
                          ? 'border-success/30 bg-success/10 text-success'
                          : 'border-danger/30 bg-danger/10 text-danger',
                      )}
                    >
                      {available ? '✓' : '×'} {label}
                    </span>
                  ))}
                </div>
                {delivery.event_url && (
                  <p className="mt-2 truncate font-mono text-[10px] text-muted-foreground">
                    {delivery.event_url}
                  </p>
                )}
                {delivery.last_error && (
                  <p className="mt-2 break-words text-danger">{delivery.last_error}</p>
                )}
              </div>
            );
          })}
          {!metaDeliveries.data?.deliveries?.length && (
            <p className="rounded border border-dashed border-border p-4 text-sm text-muted-foreground">
              Nenhuma entrega Meta registrada.
            </p>
          )}
        </div>
      </div>
    </Module>
  );
}
