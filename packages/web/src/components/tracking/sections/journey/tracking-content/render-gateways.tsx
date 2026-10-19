'use client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Plus } from 'lucide-react';
import { Module } from './module';
import { renderGatewayForm } from './render-gateway-form';
import { renderVendepayAccount } from './render-vendepay-account';
import type { TrackingContentContext } from './tracking-content-context';
export function renderGateways(context: TrackingContentContext) {
  const {
    canManage,
    config,
    vendepayConnections,
    setSelectedVendepayConnectionId,
    setVendepayWebhook,
    setVendepaySigningSecret,
    selectedVendepayConnectionId,
    vendepayConnectionName,
    setVendepayConnectionName,
    createVendepayConnection,
    selectedVendepayConnection,
    vendepaySigningSecret,
    saveVendepaySigningSecret,
    vendepayPayload,
    setVendepayPayload,
    previewVendepay,
    vendepayReceipts,
  } = context;
  return (
    <Module
      title="Gateways"
      description="VendePay mantém seu fluxo próprio. Outros gateways entram pela camada universal do TMX, sem substituir a conexão existente."
    >
      {renderGatewayForm(context)}
      <div className="space-y-2">
        {vendepayConnections.map((connection) => (
          <button
            key={connection.id}
            type="button"
            onClick={() => {
              setSelectedVendepayConnectionId(connection.id);
              setVendepayWebhook('');
              setVendepaySigningSecret('');
            }}
            className={cn(
              'flex w-full items-center justify-between rounded border p-4 text-left transition-colors',
              selectedVendepayConnectionId === connection.id
                ? 'border-cyan-300/35 bg-cyan-300/[0.06]'
                : 'border-white/[0.07] hover:border-white/[0.14]',
            )}
          >
            <div>
              <p className="text-sm font-medium text-white/80">{connection.name}</p>
              <p className="mt-1 font-mono text-xs text-cyan-200/60">
                Vendepay · atribuição: {connection.propagation_param}
              </p>
            </div>
            <span
              className={cn('text-xs', connection.enabled ? 'text-emerald-300' : 'text-white/35')}
            >
              {connection.enabled ? 'ativo' : 'pausado'}
            </span>
          </button>
        ))}
        {canManage && config.data?.configured && (
          <div className="flex flex-col gap-2 rounded border border-dashed border-cyan-300/20 p-3 sm:flex-row">
            <Input
              aria-label="Nome da nova conta Vendepay"
              placeholder="Ex.: Vendepay Brasil · Conta 02"
              value={vendepayConnectionName}
              onChange={(event) => setVendepayConnectionName(event.target.value)}
            />
            <Button
              className="gap-2"
              disabled={
                vendepayConnectionName.trim().length < 2 || createVendepayConnection.isPending
              }
              onClick={() => createVendepayConnection.mutate()}
            >
              <Plus className="h-4 w-4" />
              {createVendepayConnection.isPending ? 'Adicionando…' : 'Adicionar conta'}
            </Button>
          </div>
        )}
      </div>
      {canManage && config.data?.configured && renderVendepayAccount(context)}
      {canManage && config.data?.configured && (
        <div className="mt-5 rounded-md border border-cyan-300/30 bg-cyan-300/[0.06] p-4 shadow-[0_0_28px_rgba(34,211,238,0.06)]">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200/70">
            2. Secret de assinatura
          </p>
          <p className="mt-2 text-sm font-medium text-cyan-100">
            Cole o secret da {selectedVendepayConnection?.name ?? 'conta selecionada'}
          </p>
          <p className="mt-1 text-xs leading-5 text-white/45">
            É a chave exibida pela Vendepay ao cadastrar o webhook. O TMX a salva criptografada e,
            depois disso, ela não volta ao navegador.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Input
              aria-label="Secret de assinatura da Vendepay"
              type="password"
              autoComplete="new-password"
              placeholder={
                selectedVendepayConnection?.signing_secret_configured
                  ? '•••••••••••••••••••••••• (configurado)'
                  : 'Cole o secret exibido pela Vendepay'
              }
              value={vendepaySigningSecret}
              onChange={(event) => setVendepaySigningSecret(event.target.value)}
            />
            <Button
              disabled={
                vendepaySigningSecret.trim().length < 16 ||
                !selectedVendepayConnection ||
                saveVendepaySigningSecret.isPending
              }
              onClick={() => saveVendepaySigningSecret.mutate()}
            >
              {saveVendepaySigningSecret.isPending
                ? 'Salvando…'
                : selectedVendepayConnection?.signing_secret_configured
                  ? 'Substituir secret'
                  : 'Salvar secret'}
            </Button>
          </div>
          {selectedVendepayConnection?.signing_secret_configured && (
            <p className="mt-2 text-xs text-emerald-300">✓ Secret configurado com segurança</p>
          )}
        </div>
      )}
      {canManage && config.data?.configured && (
        <div className="mt-5 rounded-md border border-white/[0.08] p-4">
          <p className="text-sm font-medium text-white/80">Homologar payload da Vendepay</p>
          <p className="mt-1 text-xs leading-5 text-white/45">
            Cole um exemplo recebido da Vendepay. O teste apenas normaliza os campos: não cria
            pedido, não envia ao Meta e não envia à UTMify.
          </p>
          <textarea
            aria-label="Payload JSON da Vendepay"
            className="mt-3 min-h-72 w-full rounded-md border border-white/[0.1] bg-black/25 p-3 font-mono text-xs leading-5 text-cyan-50 outline-none focus:border-cyan-300/40"
            value={vendepayPayload}
            onChange={(event) => setVendepayPayload(event.target.value)}
            spellCheck={false}
          />
          <Button
            className="mt-3"
            variant="outline"
            disabled={previewVendepay.isPending}
            onClick={() => previewVendepay.mutate()}
          >
            {previewVendepay.isPending ? 'Validando…' : 'Validar sem criar venda'}
          </Button>
          {previewVendepay.data && (
            <div
              className={cn(
                'mt-3 rounded border p-3 text-xs',
                previewVendepay.data.processable
                  ? 'border-emerald-300/20 bg-emerald-300/[0.05] text-emerald-100'
                  : 'border-red-300/20 bg-red-300/[0.05] text-red-100',
              )}
            >
              <p className="font-medium">
                {previewVendepay.data.processable
                  ? 'Payload reconhecido'
                  : 'Payload precisa de ajuste'}
              </p>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-white/55">
                {JSON.stringify(
                  previewVendepay.data.normalized ??
                    previewVendepay.data.diagnostics ?? ['Formato não reconhecido'],
                  null,
                  2,
                )}
              </pre>
            </div>
          )}
        </div>
      )}
      <div className="mt-6">
        <p className="hud-label">Últimos webhooks da Vendepay</p>
        <div className="mt-3 space-y-2">
          {(vendepayReceipts.data?.receipts ?? []).slice(0, 20).map((receipt) => (
            <div
              key={receipt.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded border border-white/[0.07] p-3 text-xs"
            >
              <div>
                <p className="font-mono text-white/70">
                  {receipt.transaction_id ?? 'Sem transação reconhecida'}
                </p>
                <p className="mt-1 text-cyan-200/60">{receipt.connection_name}</p>
                <p className="mt-1 text-white/35">
                  {new Date(receipt.received_at).toLocaleString('pt-BR')}
                  {receipt.payment_method ? ` · ${receipt.payment_method}` : ''}
                </p>
              </div>
              <span
                className={
                  receipt.state === 'processed' || receipt.state === 'duplicate'
                    ? 'text-emerald-300'
                    : receipt.state === 'quarantined'
                      ? 'text-red-300'
                      : 'text-amber-300'
                }
              >
                {receipt.state}
              </span>
            </div>
          ))}
          {!vendepayReceipts.data?.receipts?.length && (
            <p className="rounded border border-dashed border-white/[0.08] p-4 text-sm text-white/35">
              Nenhum webhook recebido ainda. Depois de configurar a URL na Vendepay, os recebimentos
              aparecerão aqui.
            </p>
          )}
        </div>
      </div>
    </Module>
  );
}
