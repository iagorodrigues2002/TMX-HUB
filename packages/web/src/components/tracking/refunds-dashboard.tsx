'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiClient } from '@/lib/api-client';
import { formatMoney, useDisplayCurrency } from '@/lib/currency-preference';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowDownRight, BadgeDollarSign, CreditCard, Loader2, RefreshCw, RotateCcw, ShieldAlert } from 'lucide-react';
import { useMemo, useState } from 'react';

const TZ = 'America/Sao_Paulo';
function today() { return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
function ago(days: number) { const [y,m,d] = today().split('-').map(Number); return new Date(Date.UTC(y!,m!-1,d!-days!,12)).toISOString().slice(0,10); }
function money(minor: number | string | undefined) { return formatMoney(String(minor ?? 0), 'BRL'); }
function dateTime(value: string) { return new Intl.DateTimeFormat('pt-BR',{ dateStyle:'short', timeStyle:'short', timeZone:TZ }).format(new Date(value)); }

export function RefundsDashboard() {
  const [from, setFrom] = useState(() => ago(29));
  const [to, setTo] = useState(today);
  const [offerId, setOfferId] = useState('');
  const [product, setProduct] = useState('');
  const [displayCurrency] = useDisplayCurrency();
  const offers = useQuery({ queryKey:['offers'], queryFn: apiClient.listOffers, retry:false });
  const report = useQuery({ queryKey:['refunds-dashboard',from,to,offerId,product], queryFn:()=>apiClient.getRefundsDashboard(from,to,offerId||undefined,product||undefined), retry:false });
  const data = report.data;
  const maxDaily = Math.max(...(data?.daily.map((day)=>day.brl_minor) ?? [1]), 1);
  const products = useMemo(()=>data?.products ?? [], [data]);
  const vendepays = useMemo(()=>data?.vendepays ?? [], [data]);
  const leadingVendepay = vendepays.find((item) => item.count > 0);
  const pick = (value:number|string|undefined) => displayCurrency === 'USD' ? formatMoney(String(Math.round(Number(value ?? 0) / 500)), 'USD') : money(value);

  return <div className="space-y-6">
    <section className="tmx-command-hero rounded-2xl border border-cyan-300/15 p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="flex gap-4">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-rose-300/25 bg-rose-400/[.08]"><RotateCcw className="h-5 w-5 text-rose-200" /></div>
          <div><p className="hud-label">Inteligência financeira</p><h1 className="mt-1 text-2xl font-semibold text-white sm:text-3xl">Reembolsos e chargebacks</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">Acompanhe perdas reais por oferta, produto e data usando o instante em que o reembolso ou chargeback ocorreu.</p></div>
        </div>
        <span className="rounded-full border border-white/10 bg-black/15 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[.16em] text-white/55">Horário de São Paulo</span>
      </div>
      <div className="mt-6 grid gap-3 md:grid-cols-4">
        <label className="space-y-1"><span className="hud-label">De</span><Input type="date" value={from} max={to} onChange={e=>setFrom(e.target.value)} /></label>
        <label className="space-y-1"><span className="hud-label">Até</span><Input type="date" value={to} min={from} max={today()} onChange={e=>setTo(e.target.value)} /></label>
        <label className="space-y-1"><span className="hud-label">Oferta</span><select value={offerId} onChange={e=>setOfferId(e.target.value)} className="h-10 w-full rounded-lg border border-cyan-100/[.16] bg-[#071720] px-3 text-sm text-white"><option value="">Todas as ofertas</option>{offers.data?.map(offer=><option key={offer.id} value={offer.id}>{offer.name}</option>)}</select></label>
        <label className="space-y-1"><span className="hud-label">Produto</span><select value={product} onChange={e=>setProduct(e.target.value)} className="h-10 w-full rounded-lg border border-cyan-100/[.16] bg-[#071720] px-3 text-sm text-white"><option value="">Todos os produtos</option>{products.map(item=><option key={item.product_name} value={item.product_name}>{item.product_name}</option>)}</select></label>
      </div>
      <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={()=>{setFrom(today());setTo(today());}}>Hoje</Button><Button size="sm" variant="outline" onClick={()=>{setFrom(ago(6));setTo(today());}}>7 dias</Button><Button size="sm" variant="outline" onClick={()=>{setFrom(ago(29));setTo(today());}}>30 dias</Button><Button size="sm" variant="outline" onClick={()=>report.refetch()}><RefreshCw className="h-3.5 w-3.5" />Atualizar</Button></div>
    </section>

    {report.isLoading ? <div className="flex items-center gap-2 p-10 text-white/50"><Loader2 className="h-4 w-4 animate-spin"/>Carregando dados financeiros…</div> : <>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={RotateCcw} label="Reembolsos" value={pick(data?.totals.refunded_brl_minor)} detail={`${data?.totals.refunded_orders ?? 0} pedidos`} tone="amber" />
        <Kpi icon={ShieldAlert} label="Chargebacks" value={pick(data?.totals.chargeback_brl_minor)} detail={`${data?.totals.chargeback_orders ?? 0} ocorrências`} tone="rose" />
        <Kpi icon={ArrowDownRight} label="Impacto total" value={pick(data?.totals.brl_minor)} detail={`${data?.totals.count ?? 0} reversões`} tone="rose" />
        <Kpi icon={BadgeDollarSign} label="Taxas de R/CB" value={`US$ ${((data?.totals.fee_usd_minor ?? 0)/100).toLocaleString('pt-BR',{minimumFractionDigits:2})}`} detail="US$ 27 por ocorrência" tone="amber" />
      </section>

      <section className="rounded-2xl border border-cyan-200/[.12] bg-[#071720]/70 p-5"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="hud-label">Origem da reversão</p><h2 className="mt-1 text-lg font-semibold text-white">VendePay Iago × VendePay Lucas</h2></div>{leadingVendepay ? <p className="rounded-full border border-rose-300/20 bg-rose-400/[.08] px-3 py-1.5 text-xs text-rose-100">Maior impacto: <span className="font-semibold">{leadingVendepay.connection_name}</span> · {pick(leadingVendepay.brl_minor)}</p> : null}</div><div className="mt-5 grid gap-3 md:grid-cols-2">{vendepays.filter((item) => item.connection_name === 'VendePay Iago' || item.connection_name === 'VendePay Lucas').map(item=><div key={item.connection_name} className="border-t border-white/[.16] bg-white/[.025] px-4 pb-4 pt-3"><div className="flex items-center justify-between gap-3"><p className="font-medium text-white">{item.connection_name}</p><span className={item.brl_minor === (leadingVendepay?.brl_minor ?? -1) && item.count > 0 ? 'text-xs font-medium text-rose-200' : 'text-xs text-white/40'}>{item.brl_minor === (leadingVendepay?.brl_minor ?? -1) && item.count > 0 ? 'Maior impacto' : '—'}</span></div><p className="mono-num mt-3 text-2xl text-rose-100">{pick(item.brl_minor)}</p><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/50"><span>{item.refunded_orders} reembolsos</span><span>{item.chargeback_orders} chargebacks</span><span>{item.count} ocorrências</span></div></div>)}</div></section>

      <section className="grid gap-5 xl:grid-cols-[1.45fr_1fr]">
        <div className="rounded-2xl border border-white/[.09] bg-[#071720]/70 p-5"><div className="flex items-center justify-between gap-3"><div><p className="hud-label">Evolução</p><h2 className="mt-1 text-lg font-semibold text-white">Valor revertido por dia</h2></div><CreditCard className="h-5 w-5 text-cyan-200/70" /></div>
          {!data?.daily.length ? <Empty /> : <div className="mt-7 overflow-x-auto pb-3"><div className="relative flex h-60 min-w-[720px] items-end gap-1.5 border-t border-white/[.16] pt-3 before:absolute before:inset-x-0 before:bottom-9 before:border-t before:border-dashed before:border-white/[.06]">{data.daily.map(day=><div key={day.date} className="group relative z-10 flex h-full min-w-5 flex-1 flex-col justify-end"><div title={`${day.date}: ${money(day.brl_minor)}`} className="min-h-1 rounded-t border-t border-amber-100/35 bg-gradient-to-t from-rose-500/70 to-amber-300/80 transition group-hover:brightness-125" style={{height:`${Math.max(3,(day.brl_minor/maxDaily)*100)}%`}} /><span className="mt-2 -rotate-45 origin-top-left whitespace-nowrap font-mono text-[10px] font-medium text-white/55">{day.date.slice(5)}</span></div>)}</div></div>}
        </div>
        <div className="rounded-2xl border border-white/[.09] bg-[#071720]/70 p-5"><p className="hud-label">Produtos mais afetados</p><h2 className="mt-1 text-lg font-semibold text-white">Onde está a perda</h2><div className="mt-5 space-y-3">{products.length ? products.slice(0,6).map(item=><div key={item.product_name}><div className="flex justify-between gap-3 text-sm"><span className="truncate text-white/70">{item.product_name}</span><span className="mono-num text-rose-200">{pick(item.brl_minor)}</span></div><div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[.06]"><div className="h-full rounded-full bg-rose-400/75" style={{width:`${Math.max(4,(item.brl_minor / Math.max(products[0]?.brl_minor ?? 1,1))*100)}%`}} /></div><p className="mt-1 text-[10px] text-white/35">{item.refunded_orders} reembolsos · {item.chargeback_orders} chargebacks</p></div>) : <Empty />}</div></div>
      </section>

      <section className="rounded-2xl border border-white/[.09] bg-[#071720]/70 p-5"><div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-200"/><div><p className="hud-label">Por oferta</p><h2 className="mt-1 text-lg font-semibold text-white">Exposição por funil</h2></div></div><div className="mt-5 overflow-x-auto"><table className="w-full min-w-[700px] text-sm"><thead className="border-b border-white/[.08] text-left text-[10px] uppercase tracking-wider text-white/40"><tr><th className="pb-3 font-medium">Oferta</th><th className="pb-3 font-medium">Reembolsos</th><th className="pb-3 font-medium">Chargebacks</th><th className="pb-3 font-medium">Impacto total</th><th className="pb-3 font-medium">Ocorrências</th></tr></thead><tbody>{data?.offers.map(offer=><tr key={offer.offer_id} className="border-b border-white/[.05] last:border-0"><td className="py-3 font-medium text-white">{offer.offer_name}</td><td className="mono-num py-3 text-amber-200">{pick(offer.refunded_brl_minor)}</td><td className="mono-num py-3 text-rose-200">{pick(offer.chargeback_brl_minor)}</td><td className="mono-num py-3 font-medium text-white">{pick(offer.brl_minor)}</td><td className="py-3 text-white/55">{offer.count}</td></tr>)}</tbody></table></div></section>
      <section className="rounded-2xl border border-white/[.09] bg-[#071720]/70 p-5"><p className="hud-label">Auditoria</p><h2 className="mt-1 text-lg font-semibold text-white">Pedidos revertidos</h2><div className="mt-5 overflow-x-auto"><table className="w-full min-w-[860px] text-sm"><thead className="border-b border-white/[.08] text-left text-[10px] uppercase tracking-wider text-white/40"><tr><th className="pb-3">Quando</th><th className="pb-3">Oferta / produto</th><th className="pb-3">Origem</th><th className="pb-3">Pedido</th><th className="pb-3">Cliente</th><th className="pb-3">Tipo</th><th className="pb-3">Valor</th></tr></thead><tbody>{data?.items.map(item=><tr key={item.id} className="border-b border-white/[.05] last:border-0"><td className="py-3 font-mono text-xs text-white/55">{dateTime(item.lifecycle_at)}</td><td className="py-3"><p className="text-white/85">{item.offer_name}</p><p className="text-xs text-white/40">{item.product_name}</p></td><td className="py-3 text-xs text-cyan-100/70">{item.connection_name}</td><td className="py-3 font-mono text-xs text-white/60">{item.external_id}</td><td className="py-3"><p className="text-white/75">{item.buyer?.name || '—'}</p><p className="text-xs text-white/35">{item.buyer?.email || '—'}</p></td><td className="py-3"><span className={item.status==='chargeback'?'rounded-full border border-rose-300/20 bg-rose-400/[.08] px-2 py-1 text-[10px] uppercase text-rose-200':'rounded-full border border-amber-300/20 bg-amber-400/[.08] px-2 py-1 text-[10px] uppercase text-amber-100'}>{item.status==='chargeback'?'Chargeback':'Reembolso'}</span></td><td className="mono-num py-3 text-rose-100">{pick(item.brl_minor)}</td></tr>)}{!data?.items.length && <tr><td colSpan={7}><Empty /></td></tr>}</tbody></table></div></section>
    </>}
  </div>;
}
function Kpi({icon:Icon,label,value,detail,tone}:{icon:typeof RotateCcw;label:string;value:string;detail:string;tone:'amber'|'rose'}) { const c=tone==='rose'?'text-rose-200':'text-amber-100'; return <div className="rounded-2xl border border-white/[.09] bg-[#071720]/70 p-5"><div className="flex items-center justify-between"><p className="hud-label">{label}</p><Icon className={`h-4 w-4 ${c}`}/></div><p className={`mono-num mt-3 text-2xl font-medium ${c}`}>{value}</p><p className="mt-1 text-xs text-white/40">{detail}</p></div>; }
function Empty(){return <div className="grid min-h-24 place-items-center text-center text-sm text-white/40">Nenhum reembolso ou chargeback neste filtro.</div>;}
