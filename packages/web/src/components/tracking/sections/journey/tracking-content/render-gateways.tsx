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
                ? 'border-border bg-accent'
                : 'border-border hover:border-border',
            )}
          >
            <div>
              <p className="text-sm font-medium text-foreground">{connection.name}</p>
              <p className="mt-1 font-mono text-xs text-primary">
                Vendepay · atribuição: {connection.propagation_param}
              </p>
            </div>
            <span
              className={cn(
                'text-xs',
                connection.enabled ? 'text-success' : 'text-muted-foreground',
              )}
            >
              {connection.enabled ? 'ativo' : 'pausado'}
            </span>
          </button>
        ))}
        {canManage && config.data?.configured && (
          <div className="flex flex-col gap-2 rounded border border-dashed border-border p-3 sm:flex-row">
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
        <div className="mt-5 rounded-md border border-border bg-accent p-4 shadow-[0_0_28px_rgba(34,211,238,0.06)]">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            2. Secret de assinatura
          </p>
          <p className="mt-2 text-sm font-medium text-primary">
            Cole o secret da {selectedVendepayConnection?.name ?? 'conta selecionada'}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
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
            <p className="mt-2 text-xs text-success">✓ Secret configurado com segurança</p>
          )}
        </div>
      )}
      {canManage && config.data?.configured && (
        <div className="mt-5 rounded-md border border-border p-4">
          <p className="text-sm font-medium text-foreground">Homologar payload da Vendepay</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Cole um exemplo recebido da Vendepay. O teste apenas normaliza os campos: não cria
            pedido, não envia ao Meta e não envia à UTMify.
          </p>
          <textarea
            aria-label="Payload JSON da Vendepay"
            className="mt-3 min-h-72 w-full rounded-md border border-border bg-accent p-3 font-mono text-xs leading-5 text-primary outline-none focus:border-border"
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
                  ? 'border-success/30 bg-success/10 text-success'
                  : 'border-danger/30 bg-danger/10 text-danger',
              )}
            >
              <p className="font-medium">
                {previewVendepay.data.processable
                  ? 'Payload reconhecido'
                  : 'Payload precisa de ajuste'}
              </p>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-muted-foreground">
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
              className="flex flex-wrap items-center justify-between gap-3 rounded border border-border p-3 text-xs"
            >
              <div>
                <p className="font-mono text-muted-foreground">
                  {receipt.transaction_id ?? 'Sem transação reconhecida'}
                </p>
                <p className="mt-1 text-primary">{receipt.connection_name}</p>
                <p className="mt-1 text-muted-foreground">
                  {new Date(receipt.received_at).toLocaleString('pt-BR')}
                  {receipt.payment_method ? ` · ${receipt.payment_method}` : ''}
                </p>
              </div>
              <span
                className={
                  receipt.state === 'processed' || receipt.state === 'duplicate'
                    ? 'text-success'
                    : receipt.state === 'quarantined'
                      ? 'text-danger'
                      : 'text-warning'
                }
              >
                {receipt.state}
              </span>
            </div>
          ))}
          {!vendepayReceipts.data?.receipts?.length && (
            <p className="rounded border border-dashed border-border p-4 text-sm text-muted-foreground">
              Nenhum webhook recebido ainda. Depois de configurar a URL na Vendepay, os recebimentos
              aparecerão aqui.
            </p>
          )}
        </div>
      </div>
    </Module>
  );
}
