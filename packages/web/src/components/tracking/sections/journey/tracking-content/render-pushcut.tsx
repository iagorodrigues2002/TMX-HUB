'use client';
import { PushcutProfiles } from '@/components/tracking/pushcut-profiles';
import { Button } from '@/components/ui/button';
import { Module } from './module';
import { renderPushcutDestinations } from './render-pushcut-destinations';
import type { TrackingContentContext } from './tracking-content-context';

export function renderPushcut(context: TrackingContentContext) {
  const { offerId, canManage, pushcutDeliveries, retryPushcutDelivery } = context;
  return (
    <Module
      title="Perfis Pushcut"
      description="Salve cada destinatário uma vez e escolha o que ele recebe."
    >
      {canManage ? (
        <PushcutProfiles key={offerId} offerId={offerId} />
      ) : (
        <p className="text-sm text-muted-foreground">
          Somente gestores podem configurar os destinatários.
        </p>
      )}
      {renderPushcutDestinations(context)}
      <div className="mt-7 border-t border-border pt-6">
        <p className="hud-label">Últimas entregas desta oferta</p>
        <div className="mt-3 space-y-2">
          {(pushcutDeliveries.data?.deliveries ?? []).slice(0, 30).map((delivery) => (
            <div
              key={delivery.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded border border-border p-3 text-xs"
            >
              <div>
                <p className="font-mono text-muted-foreground">{delivery.transaction_id}</p>
                <p className="mt-1 text-muted-foreground">
                  {delivery.destination_name ?? 'Destino removido'} · {delivery.order_kind} ·{' '}
                  {delivery.attempts} tentativa(s)
                  {delivery.response_status ? ` · HTTP ${delivery.response_status}` : ''}
                </p>
                {delivery.last_error && (
                  <p className="mt-1 max-w-2xl break-words text-danger">{delivery.last_error}</p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={
                    delivery.state === 'delivered'
                      ? 'text-success'
                      : delivery.state === 'failed' || delivery.state === 'dead'
                        ? 'text-danger'
                        : 'text-muted-foreground'
                  }
                >
                  {delivery.state}
                </span>
                {canManage && (delivery.state === 'failed' || delivery.state === 'dead') && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => retryPushcutDelivery.mutate(delivery.id)}
                  >
                    Reenviar
                  </Button>
                )}
              </div>
            </div>
          ))}
          {!pushcutDeliveries.data?.deliveries?.length && (
            <p className="rounded border border-dashed border-border p-4 text-sm text-muted-foreground">
              As entregas aparecerão após a próxima venda aprovada.
            </p>
          )}
        </div>
      </div>
    </Module>
  );
}
