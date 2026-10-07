'use client';

import {
  type GatewayAccount,
  type GatewayFormValues,
  type GatewayProvider,
  gatewayRegistry,
} from '@/components/tracking/sections/finance/gateway-registry';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Check, Copy, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

interface GatewayCardProps {
  provider: GatewayProvider;
  accounts: GatewayAccount[];
  canManage: boolean;
  onSave: (
    provider: GatewayProvider,
    account: GatewayAccount | null,
    values: GatewayFormValues,
  ) => Promise<{ webhookUrl?: string }>;
}

export function GatewayCard({ provider, accounts, canManage, onSave }: GatewayCardProps) {
  const registry = gatewayRegistry[provider];
  const Icon = registry.icon;
  const SettingsForm = registry.SettingsForm;
  const [editingAccount, setEditingAccount] = useState<GatewayAccount | 'new' | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const canAdd = registry.multiAccount || accounts.length === 0;

  const save = async (values: GatewayFormValues) => {
    setIsSaving(true);
    setError('');
    try {
      const result = await onSave(
        provider,
        editingAccount === 'new' ? null : editingAccount,
        values,
      );
      setWebhookUrl(result.webhookUrl ?? '');
      setEditingAccount(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível salvar a conexão.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <article className="overflow-hidden rounded-xl border border-white/[0.09] bg-black/15">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.07] px-4 py-4 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-cyan-300/20 bg-cyan-300/[0.06] text-cyan-200">
            <Icon aria-hidden className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold text-white">{registry.label}</h3>
              <span className="rounded-full border border-white/[0.09] px-2 py-0.5 text-[11px] text-white/45">
                {accounts.length} {accounts.length === 1 ? 'conta' : 'contas'}
              </span>
            </div>
            <p className="mt-1 text-xs leading-5 text-white/45">{registry.description}</p>
          </div>
        </div>
        {canManage && canAdd && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setError('');
              setWebhookUrl('');
              setEditingAccount('new');
            }}
          >
            <Plus aria-hidden className="h-4 w-4" />
            {accounts.length ? 'Adicionar conta' : 'Configurar'}
          </Button>
        )}
      </header>

      <div className="divide-y divide-white/[0.06]">
        {accounts.map((account) => (
          <div key={account.id}>
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white/80">{account.name}</p>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/40">
                  <span className={account.enabled ? 'text-emerald-300' : 'text-white/40'}>
                    {account.enabled ? 'Ativa' : 'Pausada'}
                  </span>
                  {account.propagationParam && <span>atribuição: {account.propagationParam}</span>}
                  {account.lastWebhookAt && <span>webhook recebido</span>}
                </div>
              </div>
              {canManage && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-expanded={editingAccount !== 'new' && editingAccount?.id === account.id}
                  onClick={() => {
                    setError('');
                    setWebhookUrl('');
                    setEditingAccount((current) =>
                      current !== 'new' && current?.id === account.id ? null : account,
                    );
                  }}
                >
                  <Pencil aria-hidden className="h-4 w-4" />
                  Editar settings
                </Button>
              )}
            </div>
            {editingAccount !== 'new' && editingAccount?.id === account.id && (
              <SettingsForm
                key={account.id}
                account={account}
                isPending={isSaving}
                onCancel={() => setEditingAccount(null)}
                onSubmit={save}
              />
            )}
          </div>
        ))}
        {!accounts.length && editingAccount !== 'new' && (
          <p className="px-5 py-5 text-sm text-white/40">Nenhuma conta configurada.</p>
        )}
      </div>

      {editingAccount === 'new' && (
        <SettingsForm
          key="new"
          account={null}
          isPending={isSaving}
          onCancel={() => setEditingAccount(null)}
          onSubmit={save}
        />
      )}

      {error && (
        <p
          className="border-t border-red-300/15 bg-red-300/[0.04] px-5 py-3 text-xs text-red-200"
          role="alert"
        >
          {error}
        </p>
      )}

      {webhookUrl && (
        <div className="border-t border-amber-300/20 bg-amber-300/[0.04] px-4 py-4 sm:px-5">
          <p className="flex items-center gap-2 text-sm font-medium text-amber-100">
            <Check aria-hidden className="h-4 w-4" />
            Webhook gerado. Copie agora; ele não será exibido novamente.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <code className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-black/25 p-3 text-xs text-cyan-100">
              {webhookUrl}
            </code>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                void navigator.clipboard.writeText(webhookUrl);
                toast.success('Webhook copiado.');
              }}
            >
              <Copy aria-hidden className="h-4 w-4" />
              Copiar
            </Button>
          </div>
        </div>
      )}
    </article>
  );
}
