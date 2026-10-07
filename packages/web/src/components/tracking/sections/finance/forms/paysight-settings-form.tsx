'use client';

import type {
  GatewayFormValues,
  GatewaySettingsFormProps,
} from '@/components/tracking/sections/finance/gateway-registry';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useState } from 'react';

export function PaysightSettingsForm({
  account,
  isPending,
  onCancel,
  onSubmit,
}: GatewaySettingsFormProps) {
  const [name, setName] = useState(account?.name ?? 'Paysight · Produção');
  const [apiKey, setApiKey] = useState('');
  const [signingSecret, setSigningSecret] = useState('');
  const [productId, setProductId] = useState(account?.settings.product_id ?? '');
  const [environment, setEnvironment] = useState<'sandbox' | 'production'>(
    account?.settings.environment ?? 'production',
  );

  const submit = async () => {
    const values: GatewayFormValues = {
      name: name.trim(),
      product_id: productId.trim(),
      environment,
      ...(apiKey.trim() ? { api_key: apiKey.trim() } : {}),
      ...(signingSecret.trim() ? { signing_secret: signingSecret.trim() } : {}),
    };
    await onSubmit(values);
  };

  return (
    <div className="grid gap-4 border-t border-cyan-300/15 p-4 sm:grid-cols-2 sm:p-5">
      <label className="space-y-2" htmlFor={`paysight-name-${account?.id ?? 'new'}`}>
        <span className="text-xs font-medium text-white/65">Nome da conexão</span>
        <Input
          id={`paysight-name-${account?.id ?? 'new'}`}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label className="space-y-2" htmlFor={`paysight-product-${account?.id ?? 'new'}`}>
        <span className="text-xs font-medium text-white/65">Product ID</span>
        <Input
          id={`paysight-product-${account?.id ?? 'new'}`}
          value={productId}
          onChange={(event) => setProductId(event.target.value)}
          placeholder="Produto na Paysight"
        />
      </label>
      <label className="space-y-2" htmlFor={`paysight-api-${account?.id ?? 'new'}`}>
        <span className="text-xs font-medium text-white/65">API key</span>
        <Input
          id={`paysight-api-${account?.id ?? 'new'}`}
          type="password"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder={
            account?.apiKeyConfigured ? 'Configurada; deixe vazio para manter' : 'API key'
          }
          autoComplete="new-password"
        />
      </label>
      <label className="space-y-2" htmlFor={`paysight-secret-${account?.id ?? 'new'}`}>
        <span className="text-xs font-medium text-white/65">Signing secret</span>
        <Input
          id={`paysight-secret-${account?.id ?? 'new'}`}
          type="password"
          value={signingSecret}
          onChange={(event) => setSigningSecret(event.target.value)}
          placeholder={
            account?.secretConfigured ? 'Configurado; deixe vazio para manter' : 'Signing secret'
          }
          autoComplete="new-password"
        />
      </label>
      <label className="space-y-2" htmlFor={`paysight-env-${account?.id ?? 'new'}`}>
        <span className="text-xs font-medium text-white/65">Ambiente</span>
        <select
          id={`paysight-env-${account?.id ?? 'new'}`}
          value={environment}
          onChange={(event) => setEnvironment(event.target.value as 'sandbox' | 'production')}
          className="h-11 w-full rounded-lg border border-input bg-bg-elevated/85 px-4 text-sm text-foreground outline-none focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="production">Produção</option>
          <option value="sandbox">Sandbox</option>
        </select>
      </label>
      <div className="flex flex-wrap items-end justify-end gap-2 sm:col-span-2">
        <Button type="button" variant="ghost" disabled={isPending} onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          type="button"
          disabled={
            name.trim().length < 2 ||
            (apiKey.length > 0 && apiKey.trim().length < 8) ||
            (signingSecret.length > 0 && signingSecret.trim().length < 8) ||
            isPending
          }
          onClick={() => void submit()}
        >
          {isPending ? 'Salvando…' : 'Salvar settings'}
        </Button>
      </div>
    </div>
  );
}
