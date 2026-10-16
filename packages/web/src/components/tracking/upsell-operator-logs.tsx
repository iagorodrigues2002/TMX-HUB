'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { usePrivacy } from '@/lib/privacy-context';
import { DateRangeFilter } from '@/components/ui/date-range-filter';
import { singleDayRange, todayIso, UPSELL_LOG_DATE_PRESETS } from '@/lib/date-range';
import { UpsellOperatorSummary } from './upsell-operator-summary';

export function UpsellOperatorLogs() {
  const [offerId, setOfferId] = useState('');
  const [period,setPeriod] = useState(()=>singleDayRange(0));
  const {isPrivate} = usePrivacy();
  const offers = useQuery({queryKey: ['offers'], queryFn: () => apiClient.listOffers()});
  const logs = useQuery({
    queryKey: ['upsell-operator-logs', offerId,period.from,period.to],
    queryFn: () => apiClient.getUpsellOperatorLogs(offerId,period),
    retry: false,
    refetchInterval: 30_000,
  });
  const data = logs.data;
  return <section className="glass-card mb-8 space-y-5 p-5" aria-labelledby="upsell-audit-title">
    <div className="space-y-2">
      <h2 id="upsell-audit-title" className="text-lg font-semibold">Upsells aprovados por pessoa</h2>
      <p className="text-sm text-muted-foreground">Uma linha por usuário: quantidade de upsells cruzados com o último clique anterior à aprovação e valor total aprovado.</p>
    </div>
    <div className="flex flex-wrap items-end gap-3">
      <label className="min-w-56 space-y-1 text-sm">Oferta
        <select className="block w-full rounded-md border border-border bg-background p-2" value={offerId} onChange={(event) => setOfferId(event.target.value)} disabled={offers.isLoading}>
          <option value="">Todas as ofertas · geral</option>
          {offers.data?.map((offer) => <option key={offer.id} value={offer.id}>{offer.name}</option>)}
        </select>
      </label>
    </div>
    <DateRangeFilter value={period} onChange={setPeriod} presets={UPSELL_LOG_DATE_PRESETS} max={todayIso()} onRefresh={()=>void logs.refetch()} isRefreshing={logs.isFetching}/>
    <p className="text-sm text-muted-foreground">Data do clique, em horário de Brasília. Se a aprovação ocorrer em outro dia, o valor continua no dia do clique. Upsells sem clique identificado não entram neste período.</p>
    {offers.isError && <p role="alert" className="text-sm text-destructive">Não foi possível carregar as ofertas.</p>}
    {logs.isLoading && <p role="status" className="text-sm">Carregando auditoria…</p>}
    {logs.isError && <p role="alert" className="text-sm text-destructive">Não foi possível consultar esta auditoria. Verifique sua permissão e tente atualizar.</p>}
    {data && !logs.isError && <>
      <p className="text-sm text-muted-foreground">{data.scope === 'self' ? 'Você vê somente seus próprios resultados nas ofertas autorizadas.' : offerId ? 'Visão consolidada da oferta.' : 'Visão geral de todas as ofertas autorizadas, agrupada por pessoa.'} Sem corte nos 50 últimos cliques. Atualização a cada 30 segundos.</p>
      <UpsellOperatorSummary rows={data.summary} unattributed={data.unattributed_totals} isPrivate={isPrivate} />
      <details className="text-sm text-muted-foreground"><summary className="cursor-pointer">Como os resultados são atribuídos</summary><p className="mt-2 max-w-prose">{data.attribution_notice} Os cliques individuais continuam armazenados para auditoria.</p></details>
    </>}
  </section>;
}
