'use client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Module } from './module';
import { renderPushcutDestinations } from './render-pushcut-destinations';
import type { TrackingContentContext } from './tracking-content-context';
export function renderPushcut(context: TrackingContentContext) {
  const {
    pushcutName,
    setPushcutName,
    pushcutSecret,
    setPushcutSecret,
    pushcutFrontNotification,
    setPushcutFrontNotification,
    pushcutUpsellNotification,
    setPushcutUpsellNotification,
    pushcutDevices,
    setPushcutDevices,
    canManage,
    createPushcutDestination,
    pushcutDeliveries,
    retryPushcutDelivery,
  } = context;
  return (
    <Module
      title="Notificações Pushcut"
      description="Receba uma notificação push no iPhone/iPad sempre que uma venda front ou upsell for aprovada. Cada destino é uma conta Pushcut (app) diferente — configure quantas precisar."
    >
      <div className="rounded border border-white/[0.07] bg-black/10 p-4 text-xs leading-5 text-white/50">
        No app Pushcut, crie uma notificação em <span className="font-mono">Notifications</span>{' '}
        (ex.: "Venda Aprovada") e outra pra upsell se quiser sons diferentes. Copie o{' '}
        <span className="font-mono">secret</span> da sua conta (aparece na URL do webhook,{' '}
        <span className="font-mono">api.pushcut.io/[secret]/notifications/...</span>) e o nome exato
        de cada notificação (ou o Reference ID, em Settings → Shortcuts).
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="pushcut-name" className="block text-xs text-white/45">
            Nome do destino (ex.: iPhone do Iago)
          </label>
          <Input
            id="pushcut-name"
            className="mt-2"
            value={pushcutName}
            onChange={(e) => setPushcutName(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="pushcut-secret" className="block text-xs text-white/45">
            Secret da conta Pushcut
          </label>
          <Input
            id="pushcut-secret"
            className="mt-2"
            type="password"
            value={pushcutSecret}
            onChange={(e) => setPushcutSecret(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="pushcut-front" className="block text-xs text-white/45">
            Nome da notificação · venda front
          </label>
          <Input
            id="pushcut-front"
            className="mt-2"
            value={pushcutFrontNotification}
            onChange={(e) => setPushcutFrontNotification(e.target.value)}
            placeholder="Venda Aprovada"
          />
        </div>
        <div>
          <label htmlFor="pushcut-upsell" className="block text-xs text-white/45">
            Nome da notificação · upsell (opcional)
          </label>
          <Input
            id="pushcut-upsell"
            className="mt-2"
            value={pushcutUpsellNotification}
            onChange={(e) => setPushcutUpsellNotification(e.target.value)}
            placeholder="Deixe em branco pra não notificar upsell"
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="pushcut-devices" className="block text-xs text-white/45">
            Dispositivos específicos (opcional, separados por vírgula)
          </label>
          <Input
            id="pushcut-devices"
            className="mt-2"
            value={pushcutDevices}
            onChange={(e) => setPushcutDevices(e.target.value)}
            placeholder="iPhone de Iago, iPad"
          />
        </div>
      </div>
      {canManage && (
        <Button
          className="mt-4"
          disabled={
            createPushcutDestination.isPending ||
            !pushcutName ||
            !pushcutSecret ||
            !pushcutFrontNotification
          }
          onClick={() => createPushcutDestination.mutate()}
        >
          Adicionar destino
        </Button>
      )}

      {renderPushcutDestinations(context)}

      <div className="mt-7 border-t border-white/[0.07] pt-6">
        <p className="hud-label">Últimas entregas</p>
        <div className="mt-3 space-y-2">
          {(pushcutDeliveries.data?.deliveries ?? []).slice(0, 30).map((delivery) => (
            <div
              key={delivery.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded border border-white/[0.07] p-3 text-xs"
            >
              <div>
                <p className="font-mono text-white/70">{delivery.transaction_id}</p>
                <p className="mt-1 text-white/35">
                  {delivery.destination_name ?? 'destino removido'} · {delivery.order_kind} ·{' '}
                  {delivery.attempts} tentativa(s)
                  {delivery.response_status ? ` · HTTP ${delivery.response_status}` : ''}
                </p>
                {delivery.last_error && (
                  <p className="mt-1 max-w-2xl break-words text-red-200/70">
                    {delivery.last_error}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={
                    delivery.state === 'delivered'
                      ? 'text-emerald-300'
                      : delivery.state === 'failed' || delivery.state === 'dead'
                        ? 'text-red-300'
                        : delivery.state === 'skipped'
                          ? 'text-white/30'
                          : 'text-amber-300'
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
            <p className="rounded border border-dashed border-white/[0.08] p-4 text-sm text-white/35">
              As entregas aparecerão aqui quando o primeiro pedido pago chegar.
            </p>
          )}
        </div>
      </div>
    </Module>
  );
}
