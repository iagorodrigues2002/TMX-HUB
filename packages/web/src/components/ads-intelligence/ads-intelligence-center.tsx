'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DataState } from '@/components/ui/data-state';
import { apiClient, type AdsIntelligenceMetrics, type AdsIntelligenceData } from '@/lib/api-client';
import { usePrivacy } from '@/lib/privacy-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Loader2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

const columns: Array<{key: keyof AdsIntelligenceMetrics; label: string; kind: 'money'|'count'|'percent'|'ratio'}> = [
  {key:'spend',label:'Gasto',kind:'money'}, {key:'impressions',label:'Impressões',kind:'count'},
  {key:'clicks',label:'Cliques',kind:'count'}, {key:'cpc',label:'CPC',kind:'money'},
  {key:'cpm',label:'CPM',kind:'money'}, {key:'ctr',label:'CTR',kind:'percent'},
  {key:'hook_rate',label:'Hook Rate',kind:'percent'}, {key:'ic',label:'IC',kind:'count'},
  {key:'front_sales',label:'Fronts',kind:'count'}, {key:'upsell_sales',label:'Upsells',kind:'count'},
  {key:'revenue',label:'Faturamento bruto',kind:'money'}, {key:'roas',label:'ROAS',kind:'ratio'},
  {key:'roi',label:'ROI de mídia',kind:'percent'},
];
const money = new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
const numeric = new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2});
const date = (value?: string|null) => value ? new Date(value).toLocaleString('pt-BR') : 'Ainda não realizada';
const selectClass = 'min-h-11 rounded-lg border border-border bg-background px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary';

function MetricColumns() {
  return <colgroup><col style={{width:224}}/>{columns.map(c=><col key={c.key} style={{width:c.key==='revenue'?160:115}}/>)}</colgroup>;
}

function MetricCells({metrics,privateMode}: {metrics: AdsIntelligenceMetrics; privateMode: boolean}) {
  return <>{columns.map(({key,kind}) => {
    const value = metrics[key];
    const financial = kind === 'money' || key === 'roas' || key === 'roi';
    const label = privateMode && financial ? '****' : value == null ? '—' : kind === 'money' ? money.format(value) : `${numeric.format(value)}${kind === 'percent' ? '%' : kind === 'ratio' ? '×' : ''}`;
    return <td key={key} className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{label}</td>;
  })}</>;
}

function BatchRow({batch,sort,privateMode}: {batch: AdsIntelligenceData['batches'][number]; sort: keyof AdsIntelligenceMetrics; privateMode: boolean}) {
  const [open,setOpen] = useState(false);
  const ads = [...batch.ads].sort((a,b) => (b[sort] ?? -Infinity) - (a[sort] ?? -Infinity) || a.name.localeCompare(b.name,'pt-BR',{numeric:true}));
  const panelId = `ads-batch-${encodeURIComponent(batch.key)}`;
  return <tbody className="border-b border-border">
    <tr className="bg-muted/20">
      <th scope="row" className="sticky left-0 z-10 min-w-56 bg-card p-0 text-left font-medium">
        <button type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(!open)} className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
          <ChevronDown aria-hidden className={`h-4 w-4 shrink-0 transition-transform duration-200 motion-reduce:transition-none ${open?'rotate-180':''}`} />
          <span>{batch.name}<span className="block text-xs font-normal text-muted-foreground">{batch.offer_name} · {batch.ads.length} anúncios</span></span>
        </button>
      </th>
      <MetricCells metrics={batch.totals} privateMode={privateMode} />
    </tr>
    <tr><td colSpan={columns.length+1} className="p-0">
      <div id={panelId} aria-hidden={!open} className="grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none" style={{gridTemplateRows:open?'1fr':'0fr'}}>
        <div className="min-h-0 overflow-hidden">
          <table className="w-full table-fixed text-sm" aria-label={`Anúncios da ${batch.name}`}>
            <MetricColumns/>
            <thead className="sr-only"><tr><th>Anúncio</th>{columns.map(c=><th key={c.key}>{c.label}</th>)}</tr></thead>
            <tbody>{ads.map(ad=><tr key={ad.key} className="border-t border-border/40 bg-background/40">
              <th scope="row" className="sticky left-0 min-w-56 bg-card px-4 py-3 pl-11 text-left font-normal">
                <span>{ad.name}</span>
                {!!ad.sources?.length && <>
                  <span className="mt-1 block break-all text-xs text-muted-foreground">Conta: {ad.sources[0]?.account_name || ad.sources[0]?.account_id || 'Não informada'}</span>
                  <details className="mt-2 text-xs" tabIndex={open?undefined:-1}>
                    <summary tabIndex={open?undefined:-1} className="cursor-pointer text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">Nomes e IDs originais</summary>
                    <div className="mt-2 space-y-3 break-words text-muted-foreground">
                      {ad.sources.map((source,index)=><dl key={index} className="space-y-2 border-t border-border pt-2">
                        {(['account','campaign','adset','ad'] as const).map((field)=><div key={field}>
                          <dt className="font-medium text-foreground">{{account:'Conta',campaign:'Campanha',adset:'Conjunto',ad:'Anúncio'}[field]}</dt>
                          <dd>{source[`${field}_name`] || 'Nome não informado'}</dd>
                          <dd className="break-all">ID: {source[`${field}_id`] || 'Não informado'}</dd>
                        </div>)}
                      </dl>)}
                    </div>
                  </details>
                </>}
              </th>
              <MetricCells metrics={ad} privateMode={privateMode}/>
            </tr>)}</tbody>
          </table>
        </div>
      </div>
    </td></tr>
  </tbody>;
}

export function AdsIntelligenceCenter() {
  const qc = useQueryClient();
  const {isPrivate} = usePrivacy();
  const query = useQuery({queryKey:['ads-intelligence'],queryFn:apiClient.getAdsIntelligence,refetchInterval:60_000});
  const [form,setForm] = useState({login:'',password:'',dashboard_id:''});
  const [editing,setEditing] = useState(false);
  const [company,setCompany] = useState('');
  const [offer,setOffer] = useState('');
  const [sort,setSort] = useState<keyof AdsIntelligenceMetrics>('roas');
  const [mappings,setMappings] = useState<Record<string,string>>({});
  const save = useMutation({mutationFn:()=>apiClient.saveAdsIntelligenceConnection(form),onSuccess:()=>{setForm({login:'',password:'',dashboard_id:''});setEditing(false);void qc.invalidateQueries({queryKey:['ads-intelligence']});toast.success('Conexão salva. A importação segue o agendamento semanal.');},onError:(e)=>toast.error(e.message)});
  const mapping = useMutation({mutationFn:apiClient.mapAdsIntelligenceCampaign,onSuccess:()=>{void qc.invalidateQueries({queryKey:['ads-intelligence']});toast.success('Campanha vinculada à oferta.');},onError:(e)=>toast.error(e.message)});
  const data = query.data;
  const companies = [...new Set((data?.offers ?? []).map(o=>o.company_name || 'Sem empresa'))].sort();
  const offers = (data?.offers ?? []).filter(o=>!company || (o.company_name || 'Sem empresa') === company);
  const batches = useMemo(()=> (data?.batches ?? []).filter(b=>{
    const candidate = data?.offers.find(o=>o.id===b.offer_id);
    return (!offer || b.offer_id===offer) && (!company || (candidate?.company_name || 'Sem empresa')===company);
  }).sort((a,b)=>(b.totals[sort] ?? -Infinity)-(a.totals[sort] ?? -Infinity) || a.name.localeCompare(b.name,'pt-BR',{numeric:true})),[data,company,offer,sort]);

  if (query.isPending) return <DataState variant="loading" title="Carregando Ads Intelligence"/>;
  if (query.isError) return <DataState variant="error" title="Não foi possível carregar os anúncios" description={query.error.message} onRetry={()=>void query.refetch()}/>;
  return <div className="space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-2xl font-semibold">Ads Intelligence</h1><p className="mt-2 max-w-3xl text-sm text-muted-foreground">Custos da UTMify e conversões do TMX, organizados por oferta e leva. Abra uma leva para comparar seus anúncios.</p></div>
      {data?.connection && <Button variant="outline" onClick={()=>setEditing(!editing)}>{editing?'Fechar configuração':'Editar conexão'}</Button>}
    </header>
    {(!data?.connection || editing) && <form className="space-y-4 rounded-xl border border-border bg-card p-5" onSubmit={e=>{e.preventDefault();save.mutate();}}>
      <h2 className="font-semibold">Dashboard geral da UTMify</h2>
      <p className="text-sm text-muted-foreground">Acesso exclusivo para esta importação. Não ativa o login nas ofertas nem altera o envio de vendas. As credenciais são protegidas no servidor e não ficam salvas no navegador.</p>
      <div className="grid gap-4 md:grid-cols-3">
        <label className="space-y-2 text-sm">Login<Input required autoComplete="off" value={form.login} onChange={e=>setForm({...form,login:e.target.value})}/></label>
        <label className="space-y-2 text-sm">Senha<Input required type="password" autoComplete="new-password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/></label>
        <label className="space-y-2 text-sm">ID da dashboard<Input required autoComplete="off" value={form.dashboard_id} onChange={e=>setForm({...form,dashboard_id:e.target.value})}/></label>
      </div>
      <p className="text-xs text-muted-foreground">Primeira importação: desde 01/08/2026. Depois, atualização uma vez por semana. Abrir esta página não consulta a UTMify.</p>
      <Button type="submit" disabled={save.isPending}>{save.isPending&&<Loader2 className="mr-2 h-4 w-4 animate-spin"/>}Salvar conexão</Button>
    </form>}
    {data?.connection && <section aria-label="Estado da importação" className="rounded-xl border border-border bg-card p-5 text-sm">
      <div className="flex flex-wrap gap-x-8 gap-y-3"><p>Estado: <span className="font-medium">{({ready:'Agendada',importing:'Importando',paused:'Pausada',running:'Importando',error:'Falha',completed:'Atualizada',idle:'Aguardando próxima atualização'} as Record<string,string>)[data.connection.state] ?? data.connection.state}</span></p><p>Última atualização: {date(data.connection.last_sync_at)}</p><p>Próxima: {data.connection.state==='paused'?'Aguardando correção da conexão':date(data.connection.next_sync_at)}</p></div>
      <p className="mt-3 text-muted-foreground">Histórico solicitado desde 01/08/2026. {data.coverage?.from && data.coverage.to ? `Cobertura disponível: ${data.coverage.from.slice(0,10)} a ${data.coverage.to.slice(0,10)}.` : 'Cobertura ainda não confirmada.'} {data.coverage?.complete ? 'Importação desse intervalo concluída.' : 'A tabela aguarda a importação completa para não comparar custos parciais com faturamento.'}</p>
      {data.connection.error && <p role="alert" className="mt-3 text-destructive">{data.connection.error}</p>}
    </section>}
    {!!data?.pending.length && <section className="space-y-3 rounded-xl border border-border bg-card p-5">
      <h2 className="font-semibold">Campanhas aguardando revisão ({data.pending.length})</h2>
      <p className="text-sm text-muted-foreground">Vincule a oferta quando ela não for reconhecida. Outros problemas de formato precisam ser corrigidos na origem. Dados pendentes ficam fora dos resultados.</p>
      {data.pending.map(p=><div key={p.campaign_key} className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
        <div className="min-w-48 flex-1"><p className="text-sm font-medium">{p.campaign_name}</p><p className="text-xs text-muted-foreground">{p.reason}</p></div>
        {p.can_map_offer ? <>
          <select aria-label={`Oferta para ${p.campaign_name}`} className={selectClass} value={mappings[p.campaign_key] ?? ''} onChange={e=>setMappings({...mappings,[p.campaign_key]:e.target.value})}><option value="">Selecione a oferta</option>{data.offers.map(o=><option key={o.id} value={o.id}>{o.company_name || 'Sem empresa'} · {o.name}</option>)}</select>
          <Button variant="outline" disabled={!mappings[p.campaign_key]||mapping.isPending} onClick={()=>mapping.mutate({campaign_key:p.campaign_key,offer_id:mappings[p.campaign_key]!})}>Vincular</Button>
        </> : <span className="text-xs text-muted-foreground">Revisar formato da importação</span>}
      </div>)}
    </section>}
    <section className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">Empresa<select className={selectClass} value={company} onChange={e=>{setCompany(e.target.value);setOffer('');}}><option value="">Todas as empresas</option>{companies.map(c=><option key={c}>{c}</option>)}</select></label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">Oferta<select className={selectClass} value={offer} onChange={e=>setOffer(e.target.value)}><option value="">Todas as ofertas</option>{offers.map(o=><option key={o.id} value={o.id}>{o.company_name || 'Sem empresa'} · {o.name}</option>)}</select></label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">Ordenar levas e anúncios<select className={selectClass} value={sort} onChange={e=>setSort(e.target.value as keyof AdsIntelligenceMetrics)}>{columns.map(c=><option key={c.key} value={c.key}>Maior {c.label}</option>)}</select></label>
      </div>
      {!batches.length ? <DataState variant="empty" title="Nenhuma leva disponível" description={data?.connection?'Aguarde a importação ou vincule as campanhas pendentes.':'Cadastre a dashboard geral para iniciar a importação.'}/> : <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[1764px] table-fixed text-sm"><caption className="sr-only">Levas e anúncios; custos em reais e faturamento bruto registrado no TMX.</caption>
          <MetricColumns/>
          <thead><tr className="border-b border-border text-xs text-muted-foreground"><th scope="col" className="sticky left-0 z-10 min-w-56 bg-card px-4 py-3 text-left">Leva</th>{columns.map(c=><th scope="col" key={c.key} className="whitespace-nowrap px-3 py-3 text-right">{c.label}</th>)}</tr></thead>
          {batches.map(batch=><BatchRow key={batch.key} batch={batch} sort={sort} privateMode={isPrivate}/>)}
        </table>
      </div>}
      <p className="text-xs text-muted-foreground">ROAS = faturamento bruto ÷ gasto. ROI de mídia = (faturamento bruto − gasto) ÷ gasto. Não incluem taxas, reembolsos ou outros custos. “—” significa dado indisponível. As taxas são recalculadas pelos totais, não pela média dos anúncios.</p>
    </section>
  </div>;
}
