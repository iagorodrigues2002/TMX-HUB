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
            className="flex flex-wrap items-center justify-between gap-3 rounded border border-white/[0.07] p-3 text-xs"
          >
            <div>
              <p className="font-mono text-white/70">{delivery.event_id}</p>
              <p className="mt-1 text-white/35">
                Pixel {delivery.pixel_id} · {delivery.attempts} tentativa(s)
              </p>
              <p className="mt-1 font-mono text-[10px] text-white/30">
                {delivery.campaign_id ?? 'sem campanha'} · {delivery.ad_id ?? 'sem anúncio'} ·{' '}
                {delivery.placement ?? 'sem posicionamento'}
              </p>
              {delivery.utmify_event_id && (
                <p className="mt-1 font-mono text-[10px] text-emerald-200/45">
                  Recibo UTMify: {delivery.utmify_event_id}
                </p>
              )}
              {delivery.last_error && (
                <p className="mt-1 max-w-2xl break-words text-red-200/70">{delivery.last_error}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
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
          <p className="rounded border border-dashed border-white/[0.08] p-4 text-sm text-white/35">
            Nenhum IC enviado neste dia.
          </p>
        )}
      </div>
    </div>
  );
}
