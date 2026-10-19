'use client';
import { cn } from '@/lib/utils';
import type { TrackingContentContext } from './tracking-content-context';
import { ValidatedUpsellLink } from './validated-upsell-link';
export function renderUpsellIdentities(context: TrackingContentContext) {
  const { filteredUpsellIdentities, offerId } = context;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-xs">
        <thead className="text-white/40">
          <tr className="border-b border-white/[0.06]">
            <th className="px-4 py-3 font-medium">Identificador</th>
            <th className="px-4 py-3 font-medium">Compra aprovada</th>
            <th className="px-4 py-3 font-medium">Origem</th>
            <th className="px-4 py-3 font-medium">Abrir upsell</th>
          </tr>
        </thead>
        <tbody>
          {filteredUpsellIdentities.map((identity) => (
            <tr key={identity.id} className="border-b border-white/[0.05] last:border-0">
              <td className="px-4 py-3">
                <code className="select-all text-cyan-100">{identity.vendid}</code>
                <span
                  className={cn(
                    'mt-1 block w-fit rounded-full border px-2 py-0.5 text-[9px]',
                    identity.vendid_confirmed
                      ? 'border-emerald-300/20 bg-emerald-300/[0.07] text-emerald-200'
                      : 'border-amber-300/20 bg-amber-300/[0.07] text-amber-200',
                  )}
                >
                  {identity.validation_state === 'not_applicable'
                    ? 'compra aprovada · ID do pedido'
                    : identity.vendid_confirmed
                      ? 'vendaId confirmado'
                      : identity.validation_state === 'processing'
                        ? 'validando vendaId'
                        : identity.validation_state === 'retry'
                          ? 'validação será tentada novamente'
                          : identity.validation_state === 'rejected'
                            ? 'validação descartada · VendePay recusou'
                            : identity.validation_state === 'failed'
                              ? 'validação descartada · tentativas encerradas'
                              : 'compra aprovada · validação na fila'}
                </span>
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-white/55">
                {new Date(identity.approved_at).toLocaleString('pt-BR', {
                  timeZone: 'America/Sao_Paulo',
                })}
              </td>
              <td className="whitespace-nowrap px-4 py-3">
                <span className="rounded-full border border-cyan-300/20 bg-cyan-300/[0.06] px-2.5 py-1 text-cyan-100">
                  {identity.connection_name}
                </span>
              </td>
              <td className="px-4 py-3">
                {identity.links.length ? (
                  <div className="flex flex-wrap gap-2">
                    {identity.links.map((link) => (
                      <ValidatedUpsellLink
                        key={link.stage_id}
                        offerId={offerId}
                        orderId={identity.id}
                        link={link}
                      />
                    ))}
                  </div>
                ) : (
                  <span
                    role={
                      identity.validation_state === 'failed' ||
                      identity.validation_state === 'rejected'
                        ? 'alert'
                        : undefined
                    }
                    className="text-amber-100/55"
                    title={identity.validation_error ?? undefined}
                  >
                    {identity.validation_state === 'not_applicable'
                      ? 'Link de recuperação de upsell não disponível para este gateway'
                      : identity.validation_error === 'account_destination_not_configured'
                        ? 'Configure o destino de upsell desta conta'
                        : identity.validation_state === 'rejected'
                          ? 'Descartado da validação automática: VendePay não confirmou elegibilidade. A compra continua registrada.'
                          : identity.validation_state === 'failed'
                            ? `Descartado da validação automática após ${identity.validation_attempts ?? 2} tentativa(s). Não haverá novas consultas automáticas. A compra continua registrada.`
                            : identity.validation_state === 'processing'
                              ? 'Consultando elegibilidade na VendePay'
                              : identity.validation_state === 'retry'
                                ? 'Nova tentativa automática agendada'
                                : 'Validação automática pendente'}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
