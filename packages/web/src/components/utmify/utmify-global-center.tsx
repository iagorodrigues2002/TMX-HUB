'use client';

import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, Cable, CheckCircle2, Database, History, Loader2, RefreshCw, Send, ShieldCheck, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

export function UtmifyGlobalCenter() {
  const qc = useQueryClient();
  const config = useQuery({ queryKey: ['utmify-global'], queryFn: () => apiClient.getUtmifyGlobal(), refetchInterval: 15_000 });
  const [form, setForm] = useState({ name: 'UTMify Geral', api_token: '', endpoint_url: 'https://api.utmify.com.br/api-credentials/orders', pixel_id: '', enabled: true });
  useEffect(() => {
    if (!config.data?.destination) return;
    setForm({ name: config.data.destination.name, api_token: '', endpoint_url: config.data.destination.endpoint_url, pixel_id: config.data.destination.pixel_id ?? '', enabled: config.data.destination.enabled });
  }, [config.data?.destination]);
  const save = useMutation({
    mutationFn: () => apiClient.saveUtmifyGlobal({ name: form.name.trim(), ...(form.api_token.trim() ? { api_token: form.api_token.trim() } : {}), endpoint_url: form.endpoint_url.trim(), ...(form.pixel_id.trim() ? { pixel_id: form.pixel_id.trim() } : { pixel_id: null }), enabled: form.enabled }),
    onSuccess: () => { toast.success('UTMify Geral configurada. As ofertas continuarão enviando também para seus destinos individuais.'); setForm((current) => ({ ...current, api_token: '' })); void qc.invalidateQueries({ queryKey: ['utmify-global'] }); },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Não foi possível salvar a UTMify Geral.'),
  });
  const test = useMutation({
    mutationFn: () => apiClient.testUtmifyGlobal(),
    onSuccess: (result) => toast.success(`Teste enviado: ${result.transaction_id}`),
    onError: (error) => toast.error(error instanceof Error ? error.message : 'A UTMify recusou o teste.'),
  });
  const replay = useMutation({
    mutationFn: () => apiClient.replayUtmifyGlobal(),
    onSuccess: (result) => { toast.success(`${result.queued} pedido(s) histórico(s) enfileirado(s); ${result.recovered} pendência(s) recuperada(s).`); void qc.invalidateQueries({ queryKey: ['utmify-global'] }); },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Não foi possível reenviar o histórico.'),
  });
  const stats = config.data?.stats;
  const deliveryRate = stats?.orders_7d ? Math.round((stats.orders_delivered_7d / stats.orders_7d) * 100) : 100;

  return <div className="signal-reveal space-y-6">
    <header className="tmx-command-hero rounded-2xl border border-cyan-300/15 bg-gradient-to-br from-cyan-300/[0.09] via-white/[0.025] to-transparent p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-5"><div><div className="mb-4 flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-xl border border-cyan-300/25 bg-cyan-300/[0.08]"><Cable className="h-5 w-5 text-cyan-300" /></div><div><p className="hud-label">TMX · UTMify Hub</p><p className="mt-1 text-xs text-emerald-200/70">Camada agregadora multi-oferta</p></div></div><h1 className="text-3xl font-bold text-white md:text-4xl">UTMify Geral</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-white/50">Uma segunda camada recebe pedidos e InitiateCheckout de todas as ofertas, sem substituir ou misturar as integrações individuais.</p></div><Button variant="outline" onClick={() => config.refetch()} className="gap-2 border-white/10"><RefreshCw className="h-4 w-4" /> Atualizar</Button></div>
    </header>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[['Pedidos · 7 dias', stats?.orders_7d ?? 0, Database], ['Entregues', stats?.orders_delivered_7d ?? 0, CheckCircle2], ['Eventos web', stats?.web_events_delivered_7d ?? 0, Activity], ['Saúde de envio', `${deliveryRate}%`, stats?.orders_failed_7d ? TriangleAlert : ShieldCheck]].map(([label,value,Icon]) => { const C = Icon as typeof Database; return <div key={String(label)} className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4"><C className="h-4 w-4 text-cyan-300" /><p className="mt-4 font-mono text-2xl text-white">{String(value)}</p><p className="mt-1 text-[10px] uppercase tracking-[0.15em] text-white/35">{String(label)}</p></div>; })}
    </section>

    <section className="rounded-2xl border border-cyan-300/15 bg-[#071720]/90 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold text-white">Destino agregador</h2><p className="mt-1 text-xs leading-5 text-white/40">Use o token e o Pixel ID pertencentes à dashboard geral da UTMify.</p></div><label className="flex items-center gap-2 text-xs text-white/60"><input type="checkbox" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} className="h-4 w-4 accent-cyan-300" /> Integração ativa</label></div>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Nome da dashboard" className="h-11 rounded-lg border border-white/10 bg-black/20 px-4 text-sm text-white outline-none focus:border-cyan-300/40" />
        <input type="password" value={form.api_token} onChange={(event) => setForm({ ...form, api_token: event.target.value })} placeholder={config.data?.destination?.token_configured ? 'Token já salvo — deixe vazio para manter' : 'API Token da UTMify Geral'} className="h-11 rounded-lg border border-white/10 bg-black/20 px-4 text-sm text-white outline-none focus:border-cyan-300/40" />
        <input value={form.pixel_id} onChange={(event) => setForm({ ...form, pixel_id: event.target.value })} placeholder="Pixel ID geral opcional (24 caracteres)" className="h-11 rounded-lg border border-white/10 bg-black/20 px-4 font-mono text-sm text-white outline-none focus:border-cyan-300/40" />
        <input value={form.endpoint_url} onChange={(event) => setForm({ ...form, endpoint_url: event.target.value })} placeholder="Endpoint de pedidos" className="h-11 rounded-lg border border-white/10 bg-black/20 px-4 text-sm text-white outline-none focus:border-cyan-300/40" />
      </div>
      <div className="mt-4 flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={() => replay.mutate()} disabled={!config.data?.configured || replay.isPending} className="gap-2 border-white/10"><History className="h-4 w-4" /> Reenviar histórico</Button><Button variant="outline" onClick={() => test.mutate()} disabled={!config.data?.configured || test.isPending} className="gap-2 border-white/10"><Send className="h-4 w-4" /> Enviar pedido teste</Button><Button onClick={() => save.mutate()} disabled={save.isPending || !form.name.trim() || (Boolean(form.pixel_id.trim()) && !/^[a-f0-9]{24}$/i.test(form.pixel_id.trim())) || (!form.api_token.trim() && !config.data?.destination?.token_configured)} className="bg-cyan-300 text-slate-950 hover:bg-cyan-200">{save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar UTMify Geral</Button></div>
    </section>

    <section className="rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.035] p-5 text-sm leading-6 text-white/55"><p className="flex items-center gap-2 font-medium text-emerald-200"><ShieldCheck className="h-4 w-4" /> Roteamento em paralelo</p><p className="mt-2">Oferta → UTMify individual da oferta <span className="text-white/25">+</span> UTMify Geral. Cada entrega possui sua própria chave de deduplicação, fila, tentativas e recibo; uma falha na geral não bloqueia a individual e vice-versa.</p></section>
  </div>;
}
