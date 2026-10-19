'use client';

import { Button } from '@/components/ui/button';
import { BellRing, Loader2, Send } from 'lucide-react';
import type { useMetaAccountsControlState } from './meta-accounts-control-use-meta-accounts-control-state';

export function renderPushcutSettings({
  pushcutForm,
  setPushcutForm,
  selectedConnection,
  pushcutConfig,
  savePushcut,
  testPushcut,
}: Pick<
  ReturnType<typeof useMetaAccountsControlState>,
  | 'pushcutForm'
  | 'setPushcutForm'
  | 'selectedConnection'
  | 'pushcutConfig'
  | 'savePushcut'
  | 'testPushcut'
> & {
  selectedConnection: NonNullable<
    ReturnType<typeof useMetaAccountsControlState>['selectedConnection']
  >;
}) {
  return (
    <section className="rounded-2xl border border-amber-300/20 bg-gradient-to-br from-amber-300/[0.07] via-bg-elevated to-transparent p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <BellRing className="mt-0.5 h-5 w-5 text-amber-300" />
          <div>
            <h2 className="font-semibold text-white">Conta travada por pagamento</h2>
            <p className="mt-1 text-xs leading-5 text-white/40">
              Configuração exclusiva do dashboard {selectedConnection.name}. O alerta dispara uma
              vez por bloqueio e rearma quando a conta normaliza.
            </p>
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs text-white/60">
          <input
            type="checkbox"
            checked={pushcutForm.enabled}
            onChange={(event) => setPushcutForm({ ...pushcutForm, enabled: event.target.checked })}
            className="h-4 w-4 accent-amber-300"
          />{' '}
          Alertas ativos
        </label>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <input
          type="password"
          aria-label="Secret Pushcut"
          value={pushcutForm.secret}
          onChange={(event) => setPushcutForm({ ...pushcutForm, secret: event.target.value })}
          placeholder={
            pushcutConfig.data?.secret_configured
              ? 'Secret já salvo — deixe vazio para manter'
              : 'Secret da API Pushcut'
          }
          className="h-11 rounded-lg border border-white/10 bg-black/20 px-4 text-sm text-white outline-none focus:border-amber-300/40"
        />
        <input
          aria-label="Nome da notificação Pushcut"
          value={pushcutForm.notification_name}
          onChange={(event) =>
            setPushcutForm({ ...pushcutForm, notification_name: event.target.value })
          }
          placeholder="Nome ou Reference ID da notificação"
          className="h-11 rounded-lg border border-white/10 bg-black/20 px-4 text-sm text-white outline-none focus:border-amber-300/40"
        />
        <input
          aria-label="Dispositivos Pushcut"
          value={pushcutForm.devices}
          onChange={(event) => setPushcutForm({ ...pushcutForm, devices: event.target.value })}
          placeholder="Dispositivos opcionais, separados por vírgula"
          className="h-11 rounded-lg border border-white/10 bg-black/20 px-4 text-sm text-white outline-none focus:border-amber-300/40 md:col-span-2"
        />
      </div>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => testPushcut.mutate()}
          disabled={!pushcutConfig.data?.secret_configured || testPushcut.isPending}
          className="gap-2 border-white/10"
        >
          <Send className="h-4 w-4" /> Enviar teste
        </Button>
        <Button
          onClick={() => savePushcut.mutate()}
          disabled={
            savePushcut.isPending ||
            !pushcutForm.notification_name.trim() ||
            (!pushcutForm.secret.trim() && !pushcutConfig.data?.secret_configured)
          }
          className="bg-amber-300 text-accent-on hover:bg-amber-200"
        >
          {savePushcut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar alerta
        </Button>
      </div>
    </section>
  );
}
