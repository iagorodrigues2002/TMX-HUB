'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { usePrivacy } from '@/lib/privacy-context';
import { Button } from '@/components/ui/button';
import { UpsellOperatorSummary } from './upsell-operator-summary';

export function UpsellOperatorLogs() {
  const [offerId, setOfferId] = useState('');
  const {isPrivate} = usePrivacy();
  const offers = useQuery({queryKey: ['offers'], queryFn: () => apiClient.listOffers()});
  const logs = useQuery({
    queryKey: ['upsell-operator-logs', offerId],
    queryFn: () => apiClient.getUpsellOperatorLogs(offerId),
    enabled: Boolean(offerId),
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
          <option value="">Selecione uma oferta</option>
          {offers.data?.map((offer) => <option key={offer.id} value={offer.id}>{offer.name}</option>)}
        </select>
      </label>
      <Button variant="outline" size="sm" onClick={() => void logs.refetch()} disabled={!offerId || logs.isFetching}> {logs.isFetching ? 'Atualizando…' : 'Atualizar auditoria'}</Button>
    </div>
    {offers.isError && <p role="alert" className="text-sm text-destructive">Não foi possível carregar as ofertas.</p>}
    {!offerId && <p className="text-sm text-muted-foreground">Escolha uma oferta para consultar o histórico persistente. O feed de ferramentas abaixo é independente.</p>}
    {logs.isLoading && <p role="status" className="text-sm">Carregando auditoria…</p>}
    {logs.isError && <p role="alert" className="text-sm text-destructive">Não foi possível consultar esta auditoria. Verifique sua permissão e tente atualizar.</p>}
    {data && !logs.isError && <>
      <p className="text-sm text-muted-foreground">{data.scope === 'self' ? 'Você vê somente seus próprios resultados.' : 'Visão consolidada da oferta.'} Todo o histórico registrado, sem corte nos 50 últimos cliques. Atualização a cada 30 segundos.</p>
      <UpsellOperatorSummary rows={data.summary} unattributed={data.unattributed_totals} isPrivate={isPrivate} />
      <details className="text-sm text-muted-foreground"><summary className="cursor-pointer">Como os resultados são atribuídos</summary><p className="mt-2 max-w-prose">{data.attribution_notice} Os cliques individuais continuam armazenados para auditoria.</p></details>
    </>}
  </section>;
}
