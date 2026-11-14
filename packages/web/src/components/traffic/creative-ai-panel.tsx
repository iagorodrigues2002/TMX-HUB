'use client';
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Bot, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { request } from '@/lib/api-client/request';
import { useAuth } from '@/lib/auth-context';
type Analysis = {
  pending?: boolean;
  error?: string | null;
  analysis: null | {
    at: string;
    cached: boolean;
    costMicros: number;
    result: { hook: string; ending: string; limitations: string[] };
    audio?: { description: string };
  };
  frames?: { second: number; image: string }[];
  transcription?: {
    analysis?: { kind: string; text: string; description: string; musicStyle?: string; hook?: string; ending?: string };
    costMicros?: number;
  };
  niche?: string;
};
export function CreativeAiPanel({
  name,
  offer,
  creativeKey,
  fileId,
  metrics,
  period,
  currency,
}: {
  name: string;
  offer: string;
  creativeKey: string;
  fileId?: string;
  period: { from: string; to: string };
  currency: 'BRL' | 'USD';
  metrics: {
    spend: number | null;
    cpm: number | null;
    cpc: number | null;
    hookRate: number | null;
    ctr: number | null;
    frontSales: number | null;
    cpa: number | null;
    metaRoas: number | null;
    upsells: number | null;
    tmxGross: number | null;
    funnelArpu: number | null;
    tmxCreativeRoas: number | null;
  };
}) {
  const [open, setOpen] = useState(false),
    { user } = useAuth();
  const args = { key: creativeKey, fileId: fileId ?? '', offer };
  const endpoint = process.env.NEXT_PUBLIC_TMX_LOCAL_PREVIEW_KIND === 'synthetic' ? '/api/creative-analysis' : '/v1/meta-control/traffic/ai/creative-analysis';
  const saved = useQuery({
    queryKey: ['creative-ai', user?.id, creativeKey, fileId],
    queryFn: () => request<Analysis>(`${endpoint}?${new URLSearchParams(args)}`),
    enabled: open && !!fileId,
    retry: false,
    refetchInterval: (query) => open && query.state.data?.pending ? 5000 : false,
  });
  const analyze = useMutation({
    mutationFn: () => request<Analysis>(endpoint, { method: 'POST', body: args }),
    onSuccess: () => void saved.refetch(),
  });
  const result = saved.data?.analysis ? saved.data : analyze.data ?? saved.data;
  const prompt = `Analise o criativo ${name}, da oferta ${offer}, de ${period.from} a ${period.to}. Cruze sua análise visual salva com investimento, vendas, CPA, ROAS Meta, CPM, CPC, CTR e hook rate, incluindo upsells, faturamento bruto, ARPU do funil e ROAS TMX. Considere o resultado completo do funil sem duplicar receitas. Compare com os criativos do mesmo nicho com menor CPM e CPC e melhor hook rate. Mostre as evidências, limitações e uma hipótese testável. Escreva uma variação de hook e CTA e um roteiro novo, sem inventar resultados.`;
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        disabled={!fileId}
        onClick={() => setOpen(true)}
        aria-label={`Analisar ${name} com IA`}
      >
        <Bot size={14} /> Analisar com IA
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{name} · Análise criativa</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {result?.niche ?? offer} · Vídeo principal do Drive · leitura visual e áudio
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['Investimento', metrics.spend],
              ['CPM', metrics.cpm],
              ['CPC', metrics.cpc],
              ['Hook rate', metrics.hookRate === null ? null : metrics.hookRate * 100],
              ['CTR', metrics.ctr === null ? null : metrics.ctr * 100],
              ['Vendas Meta', metrics.frontSales],
              ['CPA', metrics.cpa],
              ['ROAS Meta', metrics.metaRoas],
              ['Upsells TMX', metrics.upsells],
              ['Faturamento bruto TMX', metrics.tmxGross],
              ['ARPU do funil', metrics.funnelArpu],
              ['ROAS TMX', metrics.tmxCreativeRoas],
            ].map(([label, value]) => (
              <div key={String(label)} className="glass-card rounded-xl border border-border p-3">
                <small>{label}</small>
                <p className="text-lg font-semibold">
                  {typeof value === 'number'
                    ? value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
                    : '—'}
                  {value !== null && (label === 'Hook rate' || label === 'CTR')
                    ? '%'
                    : (label === 'ROAS Meta' || label === 'ROAS TMX') && value !== null
                      ? '×'
                      : ''}
                </p>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {period.from} a {period.to} · {currency}. No assistente, valores monetários são
            consolidados em BRL. A comparação cruza estas métricas com as cenas e o áudio salvos.
          </p>
          {(saved.isPending || analyze.isPending || saved.data?.pending) && (
            <p role="status">
              <Loader2 className="inline animate-spin" size={16} />{' '}
              {analyze.isPending || saved.data?.pending
                ? 'Extraindo quadros e analisando o áudio. Aguarde…'
                : 'Carregando análise salva…'}
            </p>
          )}
          {(saved.error || analyze.error) && (
            <p role="alert">{(analyze.error ?? saved.error)?.message}</p>
          )}
          {saved.data?.error && <p role="alert">{saved.data.error}</p>}
          <div className="flex flex-wrap gap-3">
            <Button disabled={analyze.isPending || saved.data?.pending} onClick={() => analyze.mutate()}>
              {result?.analysis ? 'Conferir arquivo e reutilizar análise' : 'Analisar vídeo com IA'}
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/assistente?prompt=${encodeURIComponent(prompt)}`}>
                Comparar métricas e criar roteiro
              </Link>
            </Button>
          </div>
          {result?.analysis && (
            <>
              <p className="text-xs text-muted-foreground">
                Salva em {new Date(result.analysis.at).toLocaleString('pt-BR')} ·{' '}
                {result.analysis.cached ? 'recuperada sem nova análise' : 'nova análise salva'} ·
                custo visual original US$ {(result.analysis.costMicros / 1e6).toFixed(4)}
              </p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {result.frames?.map((f) => (
                  <figure key={f.second}>
                    <img
                      className="aspect-[9/16] w-full rounded-lg object-contain bg-accent"
                      src={f.image}
                      alt={`Quadro do criativo em ${f.second}s`}
                    />
                    <figcaption className="text-center text-xs">{f.second}s</figcaption>
                  </figure>
                ))}
              </div>
              <h3 className="font-semibold">Hook · primeiros segundos</h3>
              <p>{result.analysis.result.hook}</p>
              <h3 className="font-semibold">Final e chamada para ação</h3>
              <p>{result.analysis.result.ending}</p>
              {result.transcription?.analysis && (
                <details open>
                  <summary>Áudio · narração e música</summary>
                  <p>{result.transcription.analysis.description}</p>
                  <p><strong>Início:</strong> {result.transcription.analysis.hook ?? 'Não identificado.'}</p>
                  <p><strong>Final:</strong> {result.transcription.analysis.ending ?? 'Não identificado.'}</p>
                  <p className="whitespace-pre-wrap">
                    {result.transcription.analysis.text || 'Sem fala para transcrever.'}
                  </p>
                </details>
              )}
              <details>
                <summary>Limites da análise</summary>
                {result.analysis.result.limitations.map((l) => (
                  <p key={l}>{l}</p>
                ))}
              </details>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
