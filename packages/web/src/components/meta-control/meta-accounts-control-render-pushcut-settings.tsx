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
    <section className="glass-card rounded-2xl border border-warning/30 bg-gradient-to-br from-warning via-bg-elevated to-transparent p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <BellRing className="mt-0.5 h-5 w-5 text-warning" />
          <div>
            <h2 className="font-semibold text-foreground">Conta travada por pagamento</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Configuração exclusiva do dashboard {selectedConnection.name}. O alerta dispara uma
              vez por bloqueio e rearma quando a conta normaliza.
            </p>
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
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
          className="h-11 rounded-lg border border-border bg-accent px-4 text-sm text-foreground outline-none focus:border-warning/30"
        />
        <input
          aria-label="Nome da notificação Pushcut"
          value={pushcutForm.notification_name}
          onChange={(event) =>
            setPushcutForm({ ...pushcutForm, notification_name: event.target.value })
          }
          placeholder="Nome ou Reference ID da notificação"
          className="h-11 rounded-lg border border-border bg-accent px-4 text-sm text-foreground outline-none focus:border-warning/30"
        />
        <input
          aria-label="Dispositivos Pushcut"
          value={pushcutForm.devices}
          onChange={(event) => setPushcutForm({ ...pushcutForm, devices: event.target.value })}
          placeholder="Dispositivos opcionais, separados por vírgula"
          className="h-11 rounded-lg border border-border bg-accent px-4 text-sm text-foreground outline-none focus:border-warning/30 md:col-span-2"
        />
      </div>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => testPushcut.mutate()}
          disabled={!pushcutConfig.data?.secret_configured || testPushcut.isPending}
          className="gap-2 border-border"
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
          className="bg-warning/10 text-accent-on hover:bg-warning/10"
        >
          {savePushcut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar alerta
        </Button>
      </div>
    </section>
  );
}
