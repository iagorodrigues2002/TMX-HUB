'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { usePrivacy } from '@/lib/privacy-context';
import { Button } from '@/components/ui/button';
import { auditMoney } from './upsell-audit-presentation';

const date = (iso: string) => new Date(iso).toLocaleString('pt-BR', {timeZone: 'America/Sao_Paulo'});

export function UpsellOperatorLogs() {
  const [offerId, setOfferId] = useState('');
  const {isPrivate} = usePrivacy();
  const offers = useQuery({queryKey: ['offers'], queryFn: () => apiClient.listOffers()});
  const logs = useQuery({
    queryKey: ['upsell-operator-logs', offerId],
    queryFn: () => apiClient.getUpsellOperatorLogs(offerId),
    enabled: Boolean(offerId),
    retry: false,
  });
  const money = (minor: number | null, currency: string | null) => auditMoney(minor, currency, isPrivate);
  const data = logs.data;
  return <section className="glass-card mb-8 space-y-5 p-5" aria-labelledby="upsell-audit-title">
    <div className="space-y-2">
      <h2 id="upsell-audit-title" className="text-lg font-semibold">Upsell · auditoria de operadores</h2>
      <p className="text-sm text-muted-foreground">Aberturas registradas pelo usuário autenticado e compras confirmadas por webhook. Um clique ou retorno manual não confirma compra.</p>
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
      <p className="rounded-md border border-border p-3 text-sm text-muted-foreground">{data.attribution_notice} {data.scope === 'self' ? 'Você está vendo somente suas próprias aberturas.' : 'Visão da oferta.'}</p>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm">
        <caption className="mb-2 text-left font-medium">Resumo por usuário · até 50 últimos registros exibidos</caption>
        <thead><tr className="border-b border-border"><th className="p-2">Usuário</th><th className="p-2">Aberturas</th><th className="p-2">Compras vinculadas</th><th className="p-2">Valor confirmado</th></tr></thead>
        <tbody>{data.summary.map((row) => <tr key={row.operator_id} className="border-b border-border"><td className="p-2">{row.operator_name || row.operator_id}</td><td className="p-2">{row.openings}</td><td className="p-2">{row.confirmed_purchases}</td><td className="p-2">{row.amounts.length ? row.amounts.map((amount) => money(amount.amount_minor, amount.currency)).join(' · ') : '—'}</td></tr>)}
        {data.unattributed_totals.map((row) => <tr key={row.currency} className="border-b border-border"><td className="p-2">Operador não determinado</td><td className="p-2">—</td><td className="p-2">{row.count}</td><td className="p-2">{money(row.amount_minor, row.currency)}</td></tr>)}</tbody>
      </table></div>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm">
        <caption className="mb-2 text-left font-medium">Últimas aberturas · até 50 registros</caption>
        <thead><tr className="border-b border-border">{['Usuário', 'Pedido / ID', 'Etapa', 'Gateway', 'Horário (Brasília)', 'Estado'].map((label) => <th key={label} className="p-2">{label}</th>)}</tr></thead>
        <tbody>{data.attempts.map((row) => <tr key={row.id} className="border-b border-border"><td className="p-2">{row.operator_name || row.operator_id}</td><td className="break-all p-2 font-mono text-xs">{row.order_id}</td><td className="p-2">{row.stage_key}</td><td className="p-2">{row.provider}</td><td className="whitespace-nowrap p-2">{date(row.opened_at)}</td><td className="p-2">Abertura registrada · não confirma compra</td></tr>)}</tbody>
      </table></div>
      {!data.attempts.length && <p className="text-sm text-muted-foreground">Nenhuma abertura registrada para esta oferta.</p>}
      {data.scope === 'offer' && <div className="overflow-x-auto"><table className="w-full text-left text-sm">
        <caption className="mb-2 text-left font-medium">Aprovações recebidas após o início da auditoria</caption>
        <thead><tr className="border-b border-border">{['Pedido / ID', 'Etapa', 'Gateway', 'Aprovado em', 'Valor', 'Operador'].map((label) => <th key={label} className="p-2">{label}</th>)}</tr></thead>
        <tbody>{data.approvals.map((row) => <tr key={`${row.provider}-${row.order_id}-${row.stage_key}`} className="border-b border-border"><td className="break-all p-2 font-mono text-xs">{row.order_id}</td><td className="p-2">{row.stage_key}</td><td className="p-2">{row.provider}</td><td className="whitespace-nowrap p-2">{date(row.approved_at)}</td><td className="whitespace-nowrap p-2">{money(row.amount_minor, row.currency)}</td><td className="p-2">{row.operator_id || 'Operador não determinado'}</td></tr>)}</tbody>
      </table>{!data.approvals.length && <p className="mt-2 text-sm text-muted-foreground">Nenhuma aprovação neste período. “Funcionou” não é confirmação financeira.</p>}</div>}
    </>}
  </section>;
}
