'use client';
import { Button } from '@/components/ui/button';
import type { TrackingContentContext } from './tracking-content-context';
export function renderPushcutDestinations(context: TrackingContentContext) {
  const {
    canManage,
    pushcutDestinations,
    resendPushcutHistory,
    testPushcutDestination,
    togglePushcutDestination,
    removePushcutDestination,
  } = context;
  return (
    <div className="mt-7 border-t border-white/[0.07] pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="hud-label">Destinos configurados</p>
        {canManage && (pushcutDestinations.data?.destinations?.length ?? 0) > 0 && (
          <Button
            size="sm"
            variant="outline"
            disabled={resendPushcutHistory.isPending}
            onClick={() => resendPushcutHistory.mutate()}
          >
            Reenviar todas as compras já feitas
          </Button>
        )}
      </div>
      <div className="mt-3 space-y-2">
        {(pushcutDestinations.data?.destinations ?? []).map((destination) => (
          <div
            key={destination.id}
            className="rounded border border-white/[0.07] bg-black/10 p-3 text-xs"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium text-white/85">{destination.name}</p>
                <p className="mt-1 text-white/40">
                  Front: <span className="font-mono">{destination.front_notification_name}</span>
                  {destination.upsell_notification_name && (
                    <>
                      {' '}
                      · Upsell:{' '}
                      <span className="font-mono">{destination.upsell_notification_name}</span>
                    </>
                  )}
                </p>
                {Array.isArray(destination.devices) && destination.devices.length > 0 && (
                  <p className="mt-1 text-white/30">
                    Dispositivos: {destination.devices.join(', ')}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className={destination.enabled ? 'text-emerald-300' : 'text-white/30'}>
                  {destination.enabled ? 'ativo' : 'desativado'}
                </span>
                {canManage && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={testPushcutDestination.isPending}
                      onClick={() => testPushcutDestination.mutate(destination.id)}
                    >
                      Testar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={togglePushcutDestination.isPending}
                      onClick={() =>
                        togglePushcutDestination.mutate({
                          destinationId: destination.id,
                          enabled: !destination.enabled,
                        })
                      }
                    >
                      {destination.enabled ? 'Desativar' : 'Ativar'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={removePushcutDestination.isPending}
                      onClick={() => removePushcutDestination.mutate(destination.id)}
                    >
                      Remover
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
        {!pushcutDestinations.data?.destinations?.length && (
          <p className="rounded border border-dashed border-white/[0.08] p-4 text-sm text-white/35">
            Nenhum destino Pushcut configurado ainda.
          </p>
        )}
      </div>
    </div>
  );
}
