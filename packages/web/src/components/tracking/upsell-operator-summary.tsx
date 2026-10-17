import React from 'react';
import { auditMoney } from './upsell-audit-presentation';

type Amount = {currency: string | null; amount_minor: number | null};
export type OperatorSummary = {operator_id: string; operator_name?: string | null; confirmed_purchases: number; amounts: Amount[]};

export function UpsellOperatorSummary({rows,unattributed,isPrivate}: {
  rows: OperatorSummary[]; unattributed: Array<Amount & {count:number}>; isPrivate:boolean;
}) {
  const money = (amounts: Amount[]) => amounts.length
    ? amounts.map(amount=>auditMoney(amount.amount_minor,amount.currency,isPrivate)).join(' · ') : '—';
  return <div className="max-w-full min-w-0 overflow-x-auto" role="region" aria-label="Resultados dos upsells por pessoa" tabIndex={0}><table className="w-full min-w-[420px] text-left text-sm">
    <caption className="sr-only">Upsells aprovados e valor bruto total por usuário</caption>
    <thead><tr className="border-b border-border"><th scope="col" className="px-3 py-3">Pessoa</th><th scope="col" className="px-3 py-3 text-right">Upsells aprovados</th><th scope="col" className="px-3 py-3 text-right">Valor total dos upsells</th></tr></thead>
    <tbody>{rows.map(row=><tr key={row.operator_id} className="border-b border-border hover:bg-muted/30"><th scope="row" className="px-3 py-4 font-medium">{row.operator_name || row.operator_id}</th><td className="px-3 py-4 text-right tabular-nums">{row.confirmed_purchases.toLocaleString('pt-BR')}</td><td className="px-3 py-4 text-right font-medium tabular-nums text-emerald-400">{money(row.amounts)}</td></tr>)}
    {unattributed.length>0 && <tr className="border-b border-border text-muted-foreground"><th scope="row" className="px-3 py-4 font-normal">Sem operador identificado</th><td className="px-3 py-4 text-right tabular-nums">{unattributed.reduce((total,row)=>total+row.count,0).toLocaleString('pt-BR')}</td><td className="px-3 py-4 text-right tabular-nums">{money(unattributed)}</td></tr>}
    {!rows.length && !unattributed.length && <tr><td colSpan={3} className="p-8 text-center text-muted-foreground">Nenhum resultado registrado para esta oferta.</td></tr>}</tbody>
  </table></div>;
}
