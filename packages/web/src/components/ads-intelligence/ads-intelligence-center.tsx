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
import { importErrorPresentation, metricPresentation, sourceAccountLabel } from './metric-presentation';

type MetricKey = Exclude<keyof AdsIntelligenceMetrics,'calculation_status'|'calculation_reason'>;
const columns: Array<{key: MetricKey; label: string; kind: 'money'|'count'|'percent'|'ratio'}> = [
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
const platformLabel = (value?: string) => ({meta:'Meta',google:'Google Ads',tiktok:'TikTok Ads'} as Record<string,string>)[value ?? ''] ?? value ?? 'Plataforma não informada';
const selectClass = 'min-h-11 w-full min-w-0 max-w-full rounded-lg border border-border bg-background px-3 text-base sm:w-auto sm:text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary';
const stickyColumnClass = 'sticky left-0 bg-[var(--color-background)] shadow-[1px_0_0_var(--color-border)]';
const tableWidth = 224 + columns.reduce((width,column)=>width+(column.key==='revenue'?160:115),0);

function MetricColumns() {
  return <colgroup><col style={{width:224}}/>{columns.map(c=><col key={c.key} style={{width:c.key==='revenue'?160:115}}/>)}</colgroup>;
}

function MetricCells({metrics,privateMode}: {metrics: AdsIntelligenceMetrics; privateMode: boolean}) {
  return <>{columns.map(({key,kind}) => {
    const value = metrics[key];
    const financial = kind === 'money' || key === 'roas' || key === 'roi';
    const presentation = metricPresentation(key, value, privateMode && financial);
    const calculated = key==='roas'||key==='roi';
    const provisional = calculated && !privateMode && value != null && metrics.calculation_status==='provisional';
    const description = !privateMode && calculated && metrics.calculation_reason ? `${presentation.description} ${metrics.calculation_reason}` : presentation.description;
    const label = privateMode && financial ? '****' : value == null ? '—' : kind === 'money' ? money.format(value) : `${numeric.format(value)}${kind === 'percent' ? '%' : kind === 'ratio' ? '×' : ''}`;
    return <td key={key} title={description || undefined} className={`whitespace-nowrap px-3 py-3 text-right tabular-nums ${presentation.tone} ${calculated?'font-semibold':''}`}><span aria-hidden="true" className="mr-1 text-[10px]">{presentation.cue}</span>{label}{presentation.cue && <span className="sr-only"> — {description}</span>}{provisional && <span className="mt-1 block text-[10px] font-normal text-muted-foreground">Parcial</span>}</td>;
  })}</>;
}

function BatchRow({batch,sort,privateMode}: {batch: AdsIntelligenceData['batches'][number]; sort: MetricKey; privateMode: boolean}) {
  const [open,setOpen] = useState(false);
  const ads = [...batch.ads].sort((a,b) => (b[sort] ?? -Infinity) - (a[sort] ?? -Infinity) || a.name.localeCompare(b.name,'pt-BR',{numeric:true}));
  const panelId = `ads-batch-${encodeURIComponent(batch.key)}`;
  return <tbody className="border-b border-border">
    <tr className="bg-muted/20">
      <th scope="row" className={`${stickyColumnClass} z-20 w-56 min-w-56 p-0 text-left font-medium`}>
        <button type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(!open)} className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
          <ChevronDown aria-hidden className={`h-4 w-4 shrink-0 transition-transform duration-200 motion-reduce:transition-none ${open?'rotate-180':''}`} />
          <span>{batch.name}<span className="block text-xs font-normal text-muted-foreground">{batch.offer_name} · {batch.ads.length} anúncios</span></span>
        </button>
      </th>
      <MetricCells metrics={batch.totals} privateMode={privateMode} />
    </tr>
    <tr><td colSpan={columns.length+1} className="p-0">
      <div id={panelId} aria-hidden={!open} className="grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none" style={{gridTemplateRows:open?'1fr':'0fr'}}>
        <div className="min-h-0 overflow-clip">
          <table className="relative table-fixed text-sm" style={{width:tableWidth,minWidth:tableWidth}} aria-label={`Anúncios da ${batch.name}`}>
            <MetricColumns/>
            <thead className="sr-only"><tr><th>Anúncio</th>{columns.map(c=><th key={c.key}>{c.label}</th>)}</tr></thead>
            <tbody>{ads.map(ad=><tr key={ad.key} className="border-t border-border/40 bg-background/40">
                <th scope="row" className={`${stickyColumnClass} z-10 w-56 min-w-56 px-4 py-3 pl-11 text-left font-normal`}>
                <span>{ad.name}</span>
                {!!ad.sources?.length && <>
                  <span className="mt-1 block break-all text-xs text-muted-foreground">{sourceAccountLabel(ad.sources)}</span>
                  {new Set(ad.sources.map(source=>source.platform).filter(Boolean)).size > 1 && <span className="mt-1 block text-xs text-muted-foreground">{[...new Set(ad.sources.map(source=>source.platform).filter(Boolean))].map(platformLabel).join(' / ')}</span>}
                  <details className="mt-2 text-xs" tabIndex={open?undefined:-1}>
                    <summary tabIndex={open?undefined:-1} className="cursor-pointer text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">Nomes e IDs originais</summary>
                    <div className="mt-2 space-y-3 break-words text-muted-foreground">
                      {ad.sources.map((source,index)=><dl key={index} className="space-y-2 border-t border-border pt-2">
                        <div><dt className="font-medium text-foreground">Plataforma</dt><dd>{platformLabel(source.platform)}</dd></div>
                        <div><dt className="font-medium text-foreground">Página anunciante</dt><dd>{source.page_name || 'Não informada'}</dd>{source.page_id && <dd className="break-all">ID: {source.page_id}</dd>}</div>
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
  const [sort,setSort] = useState<MetricKey>('roas');
  const [mappings,setMappings] = useState<Record<string,string>>({});
  const save = useMutation({mutationFn:()=>apiClient.saveAdsIntelligenceConnection(form),onSuccess:()=>{setForm({login:'',password:'',dashboard_id:''});setEditing(false);void qc.invalidateQueries({queryKey:['ads-intelligence']});toast.success('Conexão salva. A importação segue o agendamento semanal.');},onError:(e)=>toast.error(e.message)});
  const mapping = useMutation({mutationFn:apiClient.mapAdsIntelligenceCampaign,onSuccess:()=>{void qc.invalidateQueries({queryKey:['ads-intelligence']});toast.success('Campanha vinculada à oferta.');},onError:(e)=>toast.error(e.message)});
  const data = query.data;
  const importError = data?.connection?.error ? importErrorPresentation(data.connection.state,data.connection.error) : null;
  const companies = [...new Set((data?.offers ?? []).map(o=>o.company_name || 'Sem empresa'))].sort();
  const offers = (data?.offers ?? []).filter(o=>!company || (o.company_name || 'Sem empresa') === company);
  const batches = useMemo(()=> (data?.coverage?.to ? data.batches : []).filter(b=>{
    const candidate = data?.offers.find(o=>o.id===b.offer_id);
    return (!offer || b.offer_id===offer) && (!company || (candidate?.company_name || 'Sem empresa')===company);
  }).sort((a,b)=>(b.totals[sort] ?? -Infinity)-(a.totals[sort] ?? -Infinity) || a.name.localeCompare(b.name,'pt-BR',{numeric:true})),[data,company,offer,sort]);

  if (query.isPending) return <DataState variant="loading" title="Carregando Ads Intelligence"/>;
  if (query.isError) return <DataState variant="error" title="Não foi possível carregar os anúncios" description={query.error.message} onRetry={()=>void query.refetch()}/>;
  // Screen-reader table labels are positioned within their respective tables,
  // so their overflow stays inside the table scroll region.
  return <div className="ads-intelligence-metrics relative min-w-0 space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-2xl font-semibold">Ads Intelligence</h1><p className="mt-2 max-w-3xl text-sm text-muted-foreground">Custos da UTMify e conversões do TMX, organizados por oferta e leva. Abra uma leva para comparar seus anúncios.</p></div>
      {data?.connection && <Button variant="outline" onClick={()=>setEditing(!editing)}>{editing?'Fechar configuração':'Editar conexão'}</Button>}
    </header>
    <section aria-label="Filtros dos anúncios" className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4">
      <label className="flex w-full min-w-0 flex-col gap-1 text-xs text-muted-foreground sm:w-44">Empresa<select className={selectClass} value={company} onChange={e=>{setCompany(e.target.value);setOffer('');}}><option value="">Todas as empresas</option>{companies.map(c=><option key={c}>{c}</option>)}</select></label>
      <label className="flex w-full min-w-0 flex-col gap-1 text-xs text-muted-foreground sm:w-56">Oferta<select className={selectClass} value={offer} onChange={e=>setOffer(e.target.value)}><option value="">Todas as ofertas</option>{offers.map(o=><option key={o.id} value={o.id}>{o.company_name || 'Sem empresa'} · {o.name}</option>)}</select></label>
      <label className="flex w-full min-w-0 flex-col gap-1 text-xs text-muted-foreground sm:w-56">Ordenar levas e anúncios<select className={selectClass} value={sort} onChange={e=>setSort(e.target.value as MetricKey)}>{columns.map(c=><option key={c.key} value={c.key}>Maior {c.label}</option>)}</select></label>
      <p role="status" className="pb-3 text-xs text-muted-foreground">{batches.length} levas no filtro</p>
    </section>
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
      <div className="flex flex-wrap gap-x-8 gap-y-3"><p>Estado: <span className="font-medium">{({ready:'Agendada',partial:'Atualizada parcialmente',retry_wait:'Aguardando nova tentativa',importing:'Importando',paused:'Pausada',running:'Importando',error:'Falha',completed:'Atualizada',idle:'Aguardando próxima atualização'} as Record<string,string>)[data.connection.state] ?? data.connection.state}</span></p><p>Última atualização: {date(data.connection.last_sync_at)}</p><p>{data.connection.state==='retry_wait'?'Nova tentativa':'Próxima'}: {data.connection.state==='paused'?'Aguardando correção da conexão':date(data.connection.next_sync_at)}</p></div>
      {data.connection.state==='retry_wait' && <p role="status" className="mt-3 text-muted-foreground">Uma falha temporária interrompeu a consulta. Tentativas automáticas de recuperação: {data.connection.retry_attempts ?? 0} de 2 por importação. Os dados já confirmados são preservados; não é necessário cadastrar a conexão novamente.</p>}
      <p className="mt-3 text-muted-foreground">Histórico solicitado desde 01/08/2026. {data.coverage?.from && data.coverage.to ? `Dados confirmados de ${data.coverage.from.slice(0,10)} até ${data.coverage.to.slice(0,10)}${data.coverage.complete ? '.' : ' — cobertura parcial.'}` : 'Nenhum intervalo confirmado ainda; não exibimos valores zero como se fossem resultados.'} {data.coverage?.complete ? 'Importação desse intervalo concluída.' : 'ROAS e ROI são calculados somente onde há custo e atribuição suficientes. Contas com falha e vínculos pendentes não são tratados como gasto zero.'}</p>
      {!!data.connection.platform_coverage?.length && <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-muted-foreground">{data.connection.platform_coverage.map(p=><li key={p.platform}>{platformLabel(p.platform)}: {({complete:'completa',partial:'parcial',unavailable:'indisponível'})[p.state]} · {p.accounts} contas</li>)}</ul>}
      {!!data.connection.account_failures?.length && <div role="status" className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
        <h2 className="font-medium">Cobertura incompleta: {data.connection.account_failures.length} contas com falha</h2>
        <p className="mt-2 text-muted-foreground">As contas disponíveis continuam na tabela. Contas com falha não representam gasto zero; seus custos estão ausentes. O TMX verificará novamente essas contas na atualização semanal e recuperará o histórico quando a origem voltar a responder.</p>
        <ul className="mt-3 space-y-3">{data.connection.account_failures.map((failure,index)=><li key={`${failure.platform}:${failure.account_id}:${index}`} className="break-words">
          <p className="font-medium">{platformLabel(failure.platform)} · {failure.account_name || 'Conta sem nome'}</p>
          <p className="break-all text-xs text-muted-foreground">ID: {failure.account_id} · {failure.from.slice(0,10)} a {failure.to.slice(0,10)}</p>
          <p className="text-xs text-muted-foreground">{failure.reason}</p>
        </li>)}</ul>
      </div>}
      {importError && <p role={importError.warning?'status':'alert'} className={`mt-3 ${importError.warning?'text-[var(--ads-cost)]':'text-destructive'}`}>{importError.message}</p>}
    </section>}
    {!!data?.pending.length && <details className="space-y-3 rounded-xl border border-border bg-card p-5">
      <summary className="min-h-11 cursor-pointer font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">Campanhas aguardando revisão ({data.pending.length}) <span className="ml-2 text-sm font-normal text-primary">Revisar campanhas</span></summary>
      <p className="text-sm text-muted-foreground">Vincule a oferta quando ela não for reconhecida. Outros problemas de formato precisam ser corrigidos na origem. Dados pendentes ficam fora dos resultados.</p>
      {data.pending.map(p=><div key={p.campaign_key} className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
        <div className="min-w-0 basis-full break-words sm:basis-48 sm:flex-1"><p className="text-sm font-medium">{p.campaign_name}</p><p className="text-xs text-muted-foreground">{p.reason}</p></div>
        {p.can_map_offer ? <>
          <select aria-label={`Oferta para ${p.campaign_name}`} className={selectClass} value={mappings[p.campaign_key] ?? ''} onChange={e=>setMappings({...mappings,[p.campaign_key]:e.target.value})}><option value="">Selecione a oferta</option>{data.offers.map(o=><option key={o.id} value={o.id}>{o.company_name || 'Sem empresa'} · {o.name}</option>)}</select>
          <Button variant="outline" disabled={!mappings[p.campaign_key]||mapping.isPending} onClick={()=>mapping.mutate({campaign_key:p.campaign_key,offer_id:mappings[p.campaign_key]!})}>Vincular</Button>
        </> : <span className="text-xs text-muted-foreground">Revisar formato da importação</span>}
      </div>)}
    </details>}
    <section className="space-y-4">
      {!batches.length ? <DataState variant="empty" title="Nenhuma leva disponível" description={data?.connection?'Aguarde a importação ou vincule as campanhas pendentes.':'Cadastre a dashboard geral para iniciar a importação.'}/> : <div className="relative overflow-x-auto rounded-xl border border-border bg-card">
        <table className="relative table-fixed text-sm" style={{width:tableWidth,minWidth:tableWidth}}><caption className="sr-only">Levas e anúncios; custos em reais e faturamento bruto registrado no TMX.</caption>
          <MetricColumns/>
          <thead><tr className="border-b border-border text-xs text-muted-foreground"><th scope="col" className={`${stickyColumnClass} z-30 w-56 min-w-56 px-4 py-3 text-left`}>Leva</th>{columns.map(c=><th scope="col" key={c.key} className="whitespace-nowrap px-3 py-3 text-right">{c.label}</th>)}</tr></thead>
          {batches.map(batch=><BatchRow key={batch.key} batch={batch} sort={sort} privateMode={isPrivate}/>)}
        </table>
      </div>}
      <p className="text-xs text-muted-foreground">ROAS = faturamento bruto ÷ gasto. ROI de mídia = (faturamento bruto − gasto) ÷ gasto. Não incluem taxas, reembolsos ou outros custos. ▲ Acima do equilíbrio de mídia (ROAS &gt; 1× / ROI &gt; 0%). ▼ Abaixo do equilíbrio. = No equilíbrio. “—” significa dado indisponível ou gasto zero. As taxas são recalculadas pelos totais, não pela média dos anúncios.</p>
    </section>
  </div>;
}
