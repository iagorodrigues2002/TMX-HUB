'use client';

import type {
  GatewayFormValues,
  GatewaySettingsFormProps,
} from '@/components/tracking/sections/finance/gateway-registry';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useState } from 'react';

export function ExplodelySettingsForm({
  account,
  isPending,
  onCancel,
  onSubmit,
}: GatewaySettingsFormProps) {
  const [name, setName] = useState(account?.name ?? 'Explodely · Produção');
  const [vendorId, setVendorId] = useState(account?.settings.vendor_id ?? '');
  const [sellerId, setSellerId] = useState(account?.settings.seller_id ?? '');
  const [currency, setCurrency] = useState(account?.settings.currency ?? 'USD');
  const [amountUnit, setAmountUnit] = useState<'decimal' | 'minor'>(
    account?.settings.amount_unit ?? 'minor',
  );
  const [amountScale, setAmountScale] = useState(account?.settings.amount_scale ?? 2);
  const [webhookSecret, setWebhookSecret] = useState('');

  const submit = async () => {
    const values: GatewayFormValues = {
      name: name.trim(),
      vendor_id: vendorId.trim(),
      seller_id: sellerId.trim(),
      currency: currency.trim().toUpperCase(),
      amount_unit: amountUnit,
      amount_scale: amountScale,
      environment: account?.settings.environment ?? 'production',
      ...(webhookSecret.trim() ? { webhook_secret: webhookSecret.trim() } : {}),
    };
    await onSubmit(values);
  };

  return (
    <div className="grid gap-4 border-t border-cyan-300/15 p-4 sm:grid-cols-2 lg:grid-cols-3 sm:p-5">
      <label className="space-y-2" htmlFor={`explodely-name-${account?.id ?? 'new'}`}>
        <span className="text-xs font-medium text-white/65">Nome da conexão</span>
        <Input
          id={`explodely-name-${account?.id ?? 'new'}`}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label className="space-y-2" htmlFor={`explodely-vendor-${account?.id ?? 'new'}`}>
        <span className="text-xs font-medium text-white/65">Vendor ID</span>
        <Input
          id={`explodely-vendor-${account?.id ?? 'new'}`}
          value={vendorId}
          onChange={(event) => setVendorId(event.target.value)}
          placeholder="ID do vendor"
        />
      </label>
      <label className="space-y-2" htmlFor={`explodely-seller-${account?.id ?? 'new'}`}>
        <span className="text-xs font-medium text-white/65">Seller ID</span>
        <Input
          id={`explodely-seller-${account?.id ?? 'new'}`}
          value={sellerId}
          onChange={(event) => setSellerId(event.target.value)}
          placeholder="Opcional"
        />
      </label>
      <label className="space-y-2" htmlFor={`explodely-currency-${account?.id ?? 'new'}`}>
        <span className="text-xs font-medium text-white/65">Currency</span>
        <Input
          id={`explodely-currency-${account?.id ?? 'new'}`}
          value={currency}
          maxLength={3}
          onChange={(event) => setCurrency(event.target.value)}
          placeholder="USD"
        />
      </label>
      <label className="space-y-2" htmlFor={`explodely-unit-${account?.id ?? 'new'}`}>
        <span className="text-xs font-medium text-white/65">Amount unit</span>
        <select
          id={`explodely-unit-${account?.id ?? 'new'}`}
          value={amountUnit}
          onChange={(event) => setAmountUnit(event.target.value as 'decimal' | 'minor')}
          className="h-11 w-full rounded-lg border border-input bg-bg-elevated/85 px-4 text-sm text-foreground outline-none focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="minor">Minor (centavos)</option>
          <option value="decimal">Decimal</option>
        </select>
      </label>
      <label className="space-y-2" htmlFor={`explodely-scale-${account?.id ?? 'new'}`}>
        <span className="text-xs font-medium text-white/65">Amount scale</span>
        <Input
          id={`explodely-scale-${account?.id ?? 'new'}`}
          type="number"
          min={0}
          max={6}
          step={1}
          value={amountScale}
          onChange={(event) => setAmountScale(Number(event.target.value))}
        />
      </label>
      <label
        className="space-y-2 sm:col-span-2 lg:col-span-3"
        htmlFor={`explodely-secret-${account?.id ?? 'new'}`}
      >
        <span className="text-xs font-medium text-white/65">Webhook secret</span>
        <textarea
          id={`explodely-secret-${account?.id ?? 'new'}`}
          value={webhookSecret}
          onChange={(event) => setWebhookSecret(event.target.value)}
          placeholder={
            account?.secretConfigured
              ? 'Configurado; cole um novo valor apenas para substituir'
              : 'Cole o secret do webhook'
          }
          autoComplete="new-password"
          spellCheck={false}
          className="min-h-24 w-full resize-y rounded-lg border border-input bg-bg-elevated/85 px-4 py-3 font-mono text-sm text-foreground outline-none transition-colors placeholder:font-sans placeholder:text-muted-foreground focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>
      <div className="flex flex-wrap justify-end gap-2 sm:col-span-2 lg:col-span-3">
        <Button type="button" variant="ghost" disabled={isPending} onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          type="button"
          disabled={
            name.trim().length < 2 ||
            !vendorId.trim() ||
            !/^[A-Za-z]{3}$/.test(currency.trim()) ||
            amountScale < 0 ||
            amountScale > 6 ||
            (webhookSecret.length > 0 && webhookSecret.trim().length < 8) ||
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
