'use client';
import type { TrackingOverviewAccount } from '@/lib/api-client';
import { formatCurrency, formatInt } from '@/components/dashboard/kpi-cards';
import { usePrivacy } from '@/lib/privacy-context';

const labels: Record<string, string> = {
  vendepay: 'VendePay',
  paysight: 'Paysight',
  syzepay: 'SyzePay',
  explodely: 'Explodely',
  unknown: 'Gateway não identificado',
};
export function GatewayOverview({ accounts }: { accounts: TrackingOverviewAccount[] }) {
  const { isPrivate } = usePrivacy();
  return (
    <section className="space-y-4 rounded-xl border border-white/10 bg-white/[0.025] p-4 sm:p-5">
      <div>
        <h2 className="text-base font-semibold text-white">Vendas por gateway</h2>
        <p className="mt-1 text-sm text-white/50">
          Mesmo período da visão geral. Faturamento bruto das aprovações, antes de taxas e
          devoluções.
        </p>
      </div>
      {accounts.map((account) => (
        <div key={account.owner_id} className="space-y-3">
          <h3 className="text-sm font-medium text-white/70">{account.owner_name}</h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead className="text-xs text-white/45">
                <tr>
                  <th className="pb-3">Gateway</th>
                  <th className="pb-3 text-right">Transações aprovadas</th>
                  <th className="pb-3 text-right">Front</th>
                  <th className="pb-3 text-right">Upsells</th>
                  <th className="pb-3 text-right">Faturamento bruto</th>
                  <th className="pb-3 text-right">Taxas</th>
                  <th className="pb-3 text-right">Reserva</th>
                  <th className="pb-3 text-right">Encargos</th>
                </tr>
              </thead>
              <tbody>
                {account.gateways?.map((row) => (
                  <tr key={row.provider} className="border-t border-white/10">
                    <th className="py-3 font-medium">{labels[row.provider] ?? row.provider}</th>
                    <td className="text-right">{formatInt(row.transactions)}</td>
                    <td className="text-right">{formatInt(row.fronts)}</td>
                    <td className="text-right">{formatInt(row.upsells)}</td>
                    <td className="text-right text-cyan-200">
                      {isPrivate
                        ? '****'
                        : formatCurrency(Number(row.gross_brl_minor) / 100, 'BRL')}
                      {row.missing_amounts > 0 && (
                        <span className="block text-xs text-amber-200">
                          Parcial: {row.missing_amounts} sem valor/cotação
                        </span>
                      )}
                    </td>
                    {[row.fees_brl_minor, row.reserve_brl_minor, row.penalty_brl_minor].map(
                      (value, index) => (
                        <td key={index} className="text-right">
                          {row.fees_missing_operations
                            ? 'Configuração incompleta'
                            : isPrivate
                              ? '****'
                              : formatCurrency((value ?? 0) / 100, 'BRL')}
                        </td>
                      ),
                    )}
                  </tr>
                ))}
                {account.syzepay_pending?.map((row) => (
                  <tr key={`syze-${row.company_name}`} className="border-t border-white/10">
                    <th className="py-3 font-medium">SyzePay · {row.company_name}</th>
                    <td colSpan={3} className="text-right text-amber-200">
                      {formatInt(row.pending_events)} eventos aguardando mapeamento
                    </td>
                    <td colSpan={4} className="text-right text-white/40">
                      Ainda não contabilizado
                    </td>
                  </tr>
                ))}
                {!account.gateways?.length && !account.syzepay_pending?.length && (
                  <tr>
                    <td colSpan={8} className="py-4 text-white/40">
                      Nenhuma transação aprovada neste período.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      <p className="text-xs text-white/40">
        Transações incluem front e upsells; não representam compradores únicos. Produtos não
        classificados continuam no total de transações. Eventos SyzePay pendentes não entram no
        faturamento.
      </p>
    </section>
  );
}
