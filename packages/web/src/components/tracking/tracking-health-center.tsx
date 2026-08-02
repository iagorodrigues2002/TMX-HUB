'use client';

import { Button } from '@/components/ui/button';
import { apiClient, type TrackingHealthView } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, BellRing, Check, CheckCircle2, RefreshCw, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

const percent = (value: number) => `${Math.round(value * 100)}%`;

export function TrackingHealthCenter({ offerId, canManage }: { offerId: string; canManage: boolean }) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['tracking-health', offerId],
    queryFn: () => apiClient.getTrackingHealth(offerId),
    refetchInterval: 60_000,
    retry: 1,
  });
  const updateAlert = useMutation({
    mutationFn: ({ alertId, action }: { alertId: string; action: 'acknowledge' | 'resolve' }) =>
      apiClient.updateTrackingHealthAlert(offerId, alertId, action),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['tracking-health', offerId] }),
    onError: (error) => toast.error((error as Error).message),
  });
  const data = query.data;
  if (query.isLoading) {
    return <div className="glass-card grid min-h-64 place-items-center"><RefreshCw className="h-5 w-5 animate-spin text-cyan-300" /></div>;
  }
  if (query.isError || !data) {
    return <div className="glass-card flex min-h-64 flex-col items-center justify-center gap-4 p-6 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-xl border border-red-300/20 bg-red-300/[0.05]"><AlertTriangle className="h-5 w-5 text-red-300" /></span>
      <div><h2 className="text-base font-semibold text-white">Não foi possível calcular a saúde agora</h2><p className="mt-2 max-w-lg text-xs leading-5 text-white/45">{query.error instanceof Error ? query.error.message : 'A API de monitoramento não respondeu.'}</p></div>
      <Button variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}><RefreshCw className={query.isFetching ? 'animate-spin' : ''} />Tentar novamente</Button>
    </div>;
  }
  const active = data.alerts.filter((alert) => alert.state !== 'resolved');
  return (
    <div className="space-y-5">
      <section className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="glass-card flex items-center gap-5 p-5 sm:p-6 xl:flex-col xl:text-center">
          <div className="relative grid h-32 w-32 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(${data.score >= 75 ? '#34d399' : data.score >= 55 ? '#fbbf24' : '#fb7185'} ${data.score * 3.6}deg, rgba(255,255,255,.055) 0)` }}>
            <div className="absolute inset-[7px] rounded-full bg-[#071720]" />
            <div className="relative">
              <p className="mono-num text-4xl font-semibold tracking-[-0.06em] text-white">{data.score}</p>
              <p className="hud-label mt-1 text-[8px]">de 100</p>
            </div>
          </div>
          <div>
            <p className="hud-label">Health Score</p>
            <h2 className="mt-2 text-xl font-semibold text-white">{data.status === 'excellent' ? 'Excelente' : data.status === 'good' ? 'Saudável' : data.status === 'attention' ? 'Precisa de atenção' : 'Crítico'}</h2>
            <p className="mt-2 text-xs leading-5 text-white/45">Calculado com configuração, captura, atribuição, entregas e gateway.</p>
          </div>
        </div>
        <div className="glass-card p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><p className="hud-label">Cobertura por camada</p><p className="mt-1 text-xs text-white/40">Atualização automática a cada minuto</p></div>
            <Button size="sm" variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}><RefreshCw className={query.isFetching ? 'animate-spin' : ''} />Atualizar</Button>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {data.components.map((item) => {
              const rate = item.weight ? item.score / item.weight : 0;
              return <div key={item.key} className="rounded-xl border border-white/[0.07] bg-black/15 p-3">
                <div className="flex items-center justify-between gap-2"><span className="text-xs text-white/55">{item.label}</span><span className={cn('mono-num text-xs', rate >= .9 ? 'text-emerald-300' : rate >= .7 ? 'text-amber-300' : 'text-red-300')}>{item.score}/{item.weight}</span></div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><div className={cn('h-full rounded-full', rate >= .9 ? 'bg-emerald-300' : rate >= .7 ? 'bg-amber-300' : 'bg-red-300')} style={{ width: `${rate * 100}%` }} /></div>
              </div>;
            })}
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {[
              ['Atribuição', percent(data.metrics.attribution_rate)], ['Meta', percent(data.metrics.meta_success)], ['UTMify', percent(data.metrics.utmify_success)], ['Webhooks', percent(data.metrics.webhook_success)], ['Pedidos ligados', percent(data.metrics.order_match)],
            ].map(([label, value]) => <div key={label} className="rounded-lg border border-cyan-300/10 bg-cyan-300/[0.025] p-3"><p className="hud-label text-[8px]">{label}</p><p className="mono-num mt-1 text-lg text-white">{value}</p></div>)}
          </div>
        </div>
      </section>

      <section className="glass-card p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl border border-cyan-300/15 bg-cyan-300/[0.06]"><BellRing className="h-4 w-4 text-cyan-300" /></span><div><p className="hud-label">Alertas e automações</p><p className="mt-1 text-sm text-white/55">{active.length ? `${active.length} incidente(s) exigindo atenção` : 'Nenhum incidente ativo'}</p></div></div>
          {!active.length && <span className="flex items-center gap-2 text-xs text-emerald-300"><CheckCircle2 className="h-4 w-4" />Operação saudável</span>}
        </div>
        <div className="mt-5 space-y-2">
          {data.alerts.map((alert) => <article key={alert.id} className={cn('flex flex-col gap-4 rounded-xl border p-4 sm:flex-row sm:items-center', alert.state === 'resolved' ? 'border-white/[0.06] opacity-45' : alert.severity === 'critical' ? 'border-red-300/20 bg-red-300/[0.035]' : 'border-amber-300/20 bg-amber-300/[0.03]')}>
            <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-lg border', alert.severity === 'critical' ? 'border-red-300/20 text-red-300' : 'border-amber-300/20 text-amber-300')}>{alert.state === 'resolved' ? <ShieldCheck className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}</span>
            <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold text-white/85">{alert.title}</h3><span className="rounded border border-white/[0.08] px-2 py-0.5 font-mono text-[8px] uppercase tracking-wider text-white/40">{alert.state}</span></div><p className="mt-1 text-xs leading-5 text-white/45">{alert.detail}</p><p className="mt-1 font-mono text-[9px] text-white/25">Detectado {new Date(alert.first_seen_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</p></div>
            {canManage && alert.state !== 'resolved' && <div className="flex gap-2"><Button size="sm" variant="outline" disabled={updateAlert.isPending} onClick={() => updateAlert.mutate({ alertId: alert.id, action: 'acknowledge' })}><Check className="h-3.5 w-3.5" />Reconhecer</Button><Button size="sm" variant="ghost" disabled={updateAlert.isPending} onClick={() => updateAlert.mutate({ alertId: alert.id, action: 'resolve' })}>Resolver</Button></div>}
          </article>)}
          {!data.alerts.length && <div className="rounded-xl border border-dashed border-emerald-300/15 p-8 text-center text-sm text-white/40">O monitor não encontrou falhas na configuração ou nas entregas.</div>}
        </div>
      </section>
    </div>
  );
}
