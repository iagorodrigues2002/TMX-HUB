'use client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { TrackingContentContext } from './tracking-content-context';
export function renderVendepayAccount(context: TrackingContentContext) {
  const {
    selectedVendepayConnectionName,
    selectedVendepayConnection,
    setSelectedVendepayConnectionName,
    renameVendepayConnection,
    toggleVendepayConnection,
    rotateVendepay,
    vendepayWebhook,
    copyVendepayWebhook,
  } = context;
  return (
    <div className="mt-5 rounded-md border border-amber-300/15 bg-amber-300/[0.04] p-4">
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-200/70">
          1. Identificação da conta
        </p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <Input
            aria-label="Nome da conta Vendepay selecionada"
            placeholder="Ex.: VendePay Mainex"
            value={selectedVendepayConnectionName}
            disabled={!selectedVendepayConnection}
            onChange={(event) => setSelectedVendepayConnectionName(event.target.value)}
          />
          <Button
            variant="outline"
            disabled={
              !selectedVendepayConnection ||
              selectedVendepayConnectionName.trim().length < 2 ||
              selectedVendepayConnectionName.trim() === selectedVendepayConnection.name ||
              renameVendepayConnection.isPending
            }
            onClick={() => renameVendepayConnection.mutate()}
          >
            {renameVendepayConnection.isPending ? 'Salvando…' : 'Salvar nome'}
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-amber-100">
            Webhook · {selectedVendepayConnection?.name ?? 'selecione uma conta'}
          </p>
          <p className="mt-1 text-xs leading-5 text-white/45">
            Cada conta possui uma URL exclusiva. Rotacionar afeta somente a selecionada.
          </p>
        </div>
        {selectedVendepayConnection && (
          <Button
            size="sm"
            variant="ghost"
            disabled={toggleVendepayConnection.isPending}
            onClick={() => toggleVendepayConnection.mutate(selectedVendepayConnection)}
          >
            {selectedVendepayConnection.enabled ? 'Pausar conta' : 'Ativar conta'}
          </Button>
        )}
      </div>
      <p className="mt-1 text-xs leading-5 text-white/45">
        Por segurança, o token só aparece ao criar ou gerar novamente a URL.
      </p>
      <Button
        className="mt-3"
        variant="outline"
        disabled={!selectedVendepayConnection || rotateVendepay.isPending}
        onClick={() => rotateVendepay.mutate()}
      >
        {rotateVendepay.isPending ? 'Gerando…' : 'Gerar URL real do webhook'}
      </Button>
      {vendepayWebhook && (
        <div className="mt-3 flex gap-2">
          <code className="min-w-0 flex-1 overflow-x-auto rounded bg-black/25 p-3 text-xs text-cyan-100">
            {vendepayWebhook}
          </code>
          <Button onClick={() => void copyVendepayWebhook()}>Copiar</Button>
        </div>
      )}
    </div>
  );
}
