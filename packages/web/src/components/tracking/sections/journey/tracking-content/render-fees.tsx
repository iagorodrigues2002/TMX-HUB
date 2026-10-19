'use client';
import { SyzepayFeeForm } from '@/components/tracking/syzepay-fees';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Module } from './module';
import type { TrackingContentContext } from './tracking-content-context';
export function renderFees(context: TrackingContentContext) {
  const {
    feeVendepayPct,
    setFeeVendepayPct,
    feeExtraAmount,
    setFeeExtraAmount,
    feeExtraCurrency,
    setFeeExtraCurrency,
    feeReservePct,
    setFeeReservePct,
    feeReserveDays,
    setFeeReserveDays,
    feePayoutDays,
    setFeePayoutDays,
    canManage,
    saveFeeSettings,
    feeSettings,
    config,
    offerId,
  } = context;
  return (
    <Module
      title="Taxas da VendePay"
      description="Esta tabela é exclusiva da VendePay nesta oferta. Paysight e Explodely têm taxas próprias por conexão, abaixo; a SyzePay é configurada na empresa. A visão geral soma cada gateway sem herdar taxas de outros."
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="fee-vendepay-pct" className="block text-xs text-white/45">
            Taxa Vendepay (%)
          </label>
          <Input
            id="fee-vendepay-pct"
            className="mt-2"
            inputMode="decimal"
            value={feeVendepayPct}
            onChange={(e) => setFeeVendepayPct(e.target.value)}
            placeholder="9.9"
          />
        </div>
        <div className="grid grid-cols-[1fr_90px] gap-2">
          <div>
            <label htmlFor="fee-extra-amount" className="block text-xs text-white/45">
              Taxa extra (por venda)
            </label>
            <Input
              id="fee-extra-amount"
              className="mt-2"
              inputMode="decimal"
              value={feeExtraAmount}
              onChange={(e) => setFeeExtraAmount(e.target.value)}
              placeholder="1.49"
            />
          </div>
          <div>
            <label htmlFor="fee-extra-currency" className="block text-xs text-white/45">
              Moeda
            </label>
            <Input
              id="fee-extra-currency"
              className="mt-2 uppercase"
              maxLength={3}
              value={feeExtraCurrency}
              onChange={(e) => setFeeExtraCurrency(e.target.value.toUpperCase())}
              placeholder="USD"
            />
          </div>
        </div>
        <div>
          <label htmlFor="fee-reserve-pct" className="block text-xs text-white/45">
            Reserva (%)
          </label>
          <Input
            id="fee-reserve-pct"
            className="mt-2"
            inputMode="decimal"
            value={feeReservePct}
            onChange={(e) => setFeeReservePct(e.target.value)}
            placeholder="6.9"
          />
        </div>
        <div>
          <label htmlFor="fee-reserve-days" className="block text-xs text-white/45">
            Tempo de reserva (dias)
          </label>
          <Input
            id="fee-reserve-days"
            className="mt-2"
            inputMode="numeric"
            value={feeReserveDays}
            onChange={(e) => setFeeReserveDays(e.target.value)}
            placeholder="90"
          />
        </div>
        <div>
          <label htmlFor="fee-payout-days" className="block text-xs text-white/45">
            Recebe em (dias)
          </label>
          <Input
            id="fee-payout-days"
            className="mt-2"
            inputMode="numeric"
            value={feePayoutDays}
            onChange={(e) => setFeePayoutDays(e.target.value)}
            placeholder="5"
          />
        </div>
      </div>
      {canManage && (
        <Button
          className="mt-4"
          disabled={saveFeeSettings.isPending}
          onClick={() => saveFeeSettings.mutate()}
        >
          Salvar taxas
        </Button>
      )}
      {feeSettings.data && !feeSettings.data.configured && (
        <p className="mt-4 rounded border border-dashed border-white/[0.08] p-3 text-xs text-white/40">
          Ainda usando os valores padrão do Mercado Global. Salve pra fixar essa configuração nesta
          oferta.
        </p>
      )}
      {canManage &&
        (config.data?.gateways ?? [])
          .filter((g) => g.provider !== 'vendepay')
          .map((g) => (
            <div key={`fee-${g.id}`} className="mt-6 border-t border-white/10 pt-4">
              <h3>{g.name}</h3>
              <SyzepayFeeForm
                id={g.id}
                settings={g.fee_settings ?? {}}
                offerId={offerId}
                gatewayLabel={g.provider === 'paysight' ? 'Paysight' : 'Explodely'}
              />
            </div>
          ))}
    </Module>
  );
}
