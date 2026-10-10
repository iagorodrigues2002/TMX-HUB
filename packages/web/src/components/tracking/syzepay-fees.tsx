'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, type SyzepayFees } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export function SyzepayFeeForm({ id, settings }: { id: string; settings: Partial<SyzepayFees> }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const [pct, setPct] = useState(settings.fee_pct?.toString() ?? '');
  const [fixed, setFixed] = useState(
    settings.fixed_fee_minor === undefined ? '' : (settings.fixed_fee_minor / 100).toFixed(2),
  );
  const [currency, setCurrency] = useState(settings.fee_currency ?? 'USD');
  const [reserve, setReserve] = useState(settings.reserve_pct?.toString() ?? '');
  const [charge, setCharge] = useState(
    settings.chargeback_fee_minor === undefined
      ? ''
      : (settings.chargeback_fee_minor / 100).toFixed(2),
  );
  const [refund, setRefund] = useState(
    settings.refund_fee_minor === undefined ? '' : (settings.refund_fee_minor / 100).toFixed(2),
  );
  const save = useMutation({
    mutationFn: () =>
      apiClient.syzeSaveFees(id, {
        fee_pct: Number(pct),
        fixed_fee_minor: Math.round(Number(fixed) * 100),
        fee_currency: currency,
        reserve_pct: Number(reserve),
        chargeback_fee_minor: Math.round(Number(charge) * 100),
        refund_fee_minor: Math.round(Number(refund) * 100),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['syzepay-connections'] });
      setOpen(false);
      toast.success('Taxas da SyzePay salvas somente nesta conexão.');
    },
    onError: (error) => toast.error((error as Error).message),
  });
  const input = 'mt-1.5 h-11 w-full rounded-md border border-white/15 bg-bg px-3 text-sm';
  return (
    <div className="mt-5 border-t border-white/10 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Taxas desta conexão SyzePay</h3>
          <p className="mt-1 text-sm text-white/50">
            {settings.fee_pct === undefined
              ? 'Não configuradas — nenhuma taxa da VendePay será herdada.'
              : `${settings.fee_pct}% por transação + tarifa fixa em ${settings.fee_currency}. Reserva: ${settings.reserve_pct}%.`}
          </p>
        </div>
        <Button variant="outline" onClick={() => setOpen(!open)}>
          {open ? 'Fechar' : 'Configurar taxas'}
        </Button>
      </div>
      {open && (
        <form
          className="mt-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-sm text-white/65">
              Taxa por transação (%)
              <input
                aria-label="Taxa SyzePay por transação (%)"
                type="number"
                min="0"
                max="100"
                step="0.01"
                required
                value={pct}
                onChange={(e) => setPct(e.target.value)}
                className={input}
              />
            </label>
            <label className="text-sm text-white/65">
              Tarifa fixa por transação
              <input
                aria-label="Tarifa fixa SyzePay"
                type="number"
                min="0"
                step="0.01"
                required
                value={fixed}
                onChange={(e) => setFixed(e.target.value)}
                className={input}
              />
            </label>
            <label className="text-sm text-white/65">
              Moeda das tarifas fixas
              <select
                aria-label="Moeda das tarifas SyzePay"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className={input}
              >
                <option>USD</option>
                <option>BRL</option>
                <option>EUR</option>
                <option>GBP</option>
              </select>
            </label>
            <label className="text-sm text-white/65">
              Reserva retida (%)
              <input
                aria-label="Reserva SyzePay (%)"
                type="number"
                min="0"
                max="100"
                step="0.01"
                required
                value={reserve}
                onChange={(e) => setReserve(e.target.value)}
                className={input}
              />
            </label>
            <label className="text-sm text-white/65">
              Tarifa por chargeback
              <input
                aria-label="Tarifa SyzePay por chargeback"
                type="number"
                min="0"
                step="0.01"
                required
                value={charge}
                onChange={(e) => setCharge(e.target.value)}
                className={input}
              />
            </label>
            <label className="text-sm text-white/65">
              Tarifa por reembolso
              <input
                aria-label="Tarifa SyzePay por reembolso"
                type="number"
                min="0"
                step="0.01"
                required
                value={refund}
                onChange={(e) => setRefund(e.target.value)}
                className={input}
              />
            </label>
          </div>
          <p className="text-xs leading-5 text-white/45">
            Informe 0 quando não houver cobrança. Reserva é retenção temporária, não taxa. Estas
            configurações são exclusivas desta conexão; o cálculo financeiro da SyzePay depende do
            mapeamento dos webhooks.
          </p>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? 'Salvando…' : 'Salvar taxas SyzePay'}
          </Button>
        </form>
      )}
    </div>
  );
}
