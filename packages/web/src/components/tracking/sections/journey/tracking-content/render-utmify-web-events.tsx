'use client';
import { Button } from '@/components/ui/button';
import type { TrackingContentContext } from './tracking-content-context';
export function renderUtmifyWebEvents(context: TrackingContentContext) {
  const { utmifyWebEvents, canManage, retryUtmifyWebEvent } = context;
  return (
    <div className="mt-6">
      <p className="hud-label">Entregas de InitiateCheckout ao Pixel UTMify</p>
      <div className="mt-3 space-y-2">
        {(utmifyWebEvents.data?.deliveries ?? []).slice(0, 20).map((delivery) => (
          <div
            key={delivery.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded border border-border p-3 text-xs"
          >
            <div>
              <p className="font-mono text-muted-foreground">{delivery.event_id}</p>
              <p className="mt-1 text-muted-foreground">
                Pixel {delivery.pixel_id} · {delivery.attempts} tentativa(s)
              </p>
              <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                {delivery.campaign_id ?? 'sem campanha'} · {delivery.ad_id ?? 'sem anúncio'} ·{' '}
                {delivery.placement ?? 'sem posicionamento'}
              </p>
              {delivery.utmify_event_id && (
                <p className="mt-1 font-mono text-[10px] text-success">
                  Recibo UTMify: {delivery.utmify_event_id}
                </p>
              )}
              {delivery.last_error && (
                <p className="mt-1 max-w-2xl break-words text-danger">{delivery.last_error}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span
                className={
                  delivery.state === 'delivered'
                    ? 'text-success'
                    : delivery.state === 'failed' || delivery.state === 'dead'
                      ? 'text-danger'
                      : 'text-warning'
                }
              >
                {delivery.state}
              </span>
              {canManage && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={retryUtmifyWebEvent.isPending}
                  onClick={() => retryUtmifyWebEvent.mutate(delivery.id)}
                >
                  Reenviar
                </Button>
              )}
            </div>
          </div>
        ))}
        {!utmifyWebEvents.data?.deliveries?.length && (
          <p className="rounded border border-dashed border-border p-4 text-sm text-muted-foreground">
            Nenhum IC enviado neste dia.
          </p>
        )}
      </div>
    </div>
  );
}
