'use client';

import type {
  GatewayFormValues,
  GatewaySettingsFormProps,
} from '@/components/tracking/sections/finance/gateway-registry';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useState } from 'react';

export function VendepaySettingsForm({
  account,
  isPending,
  onCancel,
  onSubmit,
}: GatewaySettingsFormProps) {
  const [vendorId, setVendorId] = useState(account?.name ?? '');
  const [secret, setSecret] = useState('');

  const submit = async () => {
    const values: GatewayFormValues = {
      name: vendorId.trim(),
      vendor_id: vendorId.trim(),
      ...(secret.trim() ? { secret: secret.trim() } : {}),
    };
    await onSubmit(values);
  };

  return (
    <div className="grid gap-4 border-t border-cyan-300/15 p-4 sm:p-5">
      <label className="space-y-2" htmlFor={`vendepay-vendor-${account?.id ?? 'new'}`}>
        <span className="text-xs font-medium text-white/65">Vendor ID</span>
        <Input
          id={`vendepay-vendor-${account?.id ?? 'new'}`}
          value={vendorId}
          onChange={(event) => setVendorId(event.target.value)}
          placeholder="Ex.: Mainex"
          autoComplete="off"
        />
      </label>
      <label className="space-y-2" htmlFor={`vendepay-secret-${account?.id ?? 'new'}`}>
        <span className="text-xs font-medium text-white/65">Secret</span>
        <textarea
          id={`vendepay-secret-${account?.id ?? 'new'}`}
          value={secret}
          onChange={(event) => setSecret(event.target.value)}
          placeholder={
            account?.secretConfigured
              ? 'Secret configurado. Cole um novo valor apenas para substituí-lo.'
              : 'Cole o secret exibido pela VendePay'
          }
          autoComplete="new-password"
          spellCheck={false}
          className="min-h-28 w-full resize-y rounded-lg border border-input bg-bg-elevated/85 px-4 py-3 font-mono text-sm text-foreground outline-none transition-colors placeholder:font-sans placeholder:text-muted-foreground focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" disabled={isPending} onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          type="button"
          disabled={
            vendorId.trim().length < 2 ||
            (secret.length > 0 && secret.trim().length < 16) ||
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
