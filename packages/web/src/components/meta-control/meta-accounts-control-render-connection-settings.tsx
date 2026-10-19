'use client';

import { Button } from '@/components/ui/button';
import { Loader2, ShieldAlert } from 'lucide-react';
import type { useMetaAccountsControlState } from './meta-accounts-control-use-meta-accounts-control-state';

export function renderConnectionSettings({
  connectionForm,
  setConnectionForm,
  saveConnection,
}: Pick<
  ReturnType<typeof useMetaAccountsControlState>,
  'connectionForm' | 'setConnectionForm' | 'saveConnection'
>) {
  return (
    <section className="rounded-2xl border border-cyan-300/15 bg-bg-elevated/90 p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 h-5 w-5 text-cyan-300" />
        <div>
          <h2 className="font-semibold text-white">Criar dashboard independente</h2>
          <p className="mt-1 text-xs leading-5 text-white/40">
            Defina um nome e conecte outro aplicativo Meta. As contas e campanhas ficarão isoladas
            dos demais dashboards.
          </p>
        </div>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <input
          aria-label="Nome da conexão"
          value={connectionForm.name}
          onChange={(event) => setConnectionForm({ ...connectionForm, name: event.target.value })}
          placeholder="Nome da conexão"
          className="h-11 rounded-lg border border-white/10 bg-black/20 px-4 text-sm text-white outline-none focus:border-cyan-300/40"
        />
        <input
          aria-label="ID do aplicativo"
          value={connectionForm.app_id}
          onChange={(event) => setConnectionForm({ ...connectionForm, app_id: event.target.value })}
          placeholder="ID do aplicativo"
          className="h-11 rounded-lg border border-white/10 bg-black/20 px-4 text-sm text-white outline-none focus:border-cyan-300/40"
        />
        <input
          type="password"
          aria-label="Secret do aplicativo"
          value={connectionForm.app_secret}
          onChange={(event) =>
            setConnectionForm({ ...connectionForm, app_secret: event.target.value })
          }
          placeholder="App Secret"
          className="h-11 rounded-lg border border-white/10 bg-black/20 px-4 text-sm text-white outline-none focus:border-cyan-300/40"
        />
        <input
          type="password"
          aria-label="Token de acesso"
          value={connectionForm.access_token}
          onChange={(event) =>
            setConnectionForm({ ...connectionForm, access_token: event.target.value })
          }
          placeholder="Token de usuário do sistema"
          className="h-11 rounded-lg border border-white/10 bg-black/20 px-4 text-sm text-white outline-none focus:border-cyan-300/40"
        />
      </div>
      <div className="mt-4 flex justify-end">
        <Button
          onClick={() => saveConnection.mutate()}
          disabled={
            saveConnection.isPending ||
            !connectionForm.app_id ||
            !connectionForm.app_secret ||
            !connectionForm.access_token
          }
        >
          {saveConnection.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Validar e
          conectar
        </Button>
      </div>
    </section>
  );
}
