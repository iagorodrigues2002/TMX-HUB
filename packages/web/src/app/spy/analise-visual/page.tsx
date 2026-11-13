'use client';
import { HubShell } from '@/components/hub/hub-shell';
import { request } from '@/lib/api-client/request';
import { useAuth } from '@/lib/auth-context';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import styles from './visual.module.css';
type Ad = {
  id: string;
  pageName: string;
  title?: string;
  previous?: { id: string };
  recoveredReference?: boolean;
  recoveryNote?: string;
  saved?: { classification: keyof typeof labels; reason: string; at: string };
};
type Comparison = {
  cached: boolean;
  at: string;
  costMicros: number;
  costReserved: boolean;
  previousAt: string;
  result: {
    classification: keyof typeof labels;
    reason: string;
    similarities: string[];
    differences: string[];
    limitations: string[];
  };
  compared: { id: string; text: string; frames: { second: number; image: string }[] }[];
};
const labels = {
  reused: 'Possível reutilização',
  variation: 'Variação identificada',
  different: 'Diferente desta referência',
  inconclusive: 'Não conclusivo',
};
export default function SpyVisualRoute() {
  return (
    <Suspense fallback={<output>Carregando análise visual…</output>}>
      <SpyVisualPage />
    </Suspense>
  );
}
function SpyVisualPage() {
  const { user } = useAuth();
  const params = useSearchParams();
  const selection = new URLSearchParams();
  for (const key of ['id', 'at']) if (params.get(key)) selection.set(key, params.get(key)!);
  const endpoint = `/api/spy-visual${selection.size ? `?${selection}` : ''}`;
  const query = useQuery({
    queryKey: ['spy-visual-preview', user?.id, endpoint],
    queryFn: () =>
      request<{
        name: string;
        at: string;
        ads: Ad[];
        summary: {
          analyzed: number;
          withReference: number;
          recovered: number;
          withoutReference: number;
          totalCostMicros: number;
          classifications: Record<keyof typeof labels, number>;
        };
      }>(endpoint),
    enabled: !!user,
    retry: false,
    refetchInterval: 30000,
  });
  const [filter, setFilter] = useState<string>('all');
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [comparison, setComparison] = useState<Comparison>();
  async function compare(ad: Ad) {
    setSelected(ad.id);
    setBusy(true);
    setError('');
    setComparison(undefined);
    if (!ad.previous) {
      setError(ad.recoveryNote ?? 'Sem referência suficiente no histórico. Nenhuma chamada à IA.');
      setBusy(false);
      return;
    }
    try {
      setComparison(
        await request<Comparison>(endpoint, {
          method: 'POST',
          body: { adId: ad.id, cachedOnly: !!ad.saved },
        }),
      );
      void query.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível comparar.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <HubShell
      breadcrumb={['SPY', 'Comparação visual']}
      previewNotice={
        process.env.NEXT_PUBLIC_TMX_LOCAL_PREVIEW_KIND === 'synthetic'
          ? 'Prévia local · cópia de anúncios reais da Library · nenhuma alteração em produção.'
          : undefined
      }
    >
      <main className={styles.page}>
        <Link href="/spy?view=monitor">← Acompanhamento</Link>
        <header>
          <div>
            <span className={styles.eyebrow}>SPY · ANÁLISE VISUAL</span>
            <h1>Comparação visual com IA</h1>
            <p>{query.data?.name ?? 'Anúncios não confirmados'}</p>
          </div>
          <span className={styles.badge}>Análises salvas por empresa</span>
        </header>
        <p className={styles.note}>
          A IA compara quadros do anúncio com uma referência do histórico. A sugestão não altera a
          confirmação técnica. Reabrir a mesma análise usa o resultado salvo.
        </p>
        {query.isPending && <output>Carregando anúncios…</output>}
        {query.error && <p role="alert">{query.error.message}</p>}
        {query.data?.summary && (
          <>
            <div className={styles.summary}>
              <div>
                <strong>
                  {query.data.summary.analyzed}/{query.data.ads.length}
                </strong>
                <span>Analisados e salvos</span>
              </div>
              <div>
                <strong>{query.data.summary.recovered}</strong>
                <span>Referências recuperadas</span>
              </div>
              <div>
                <strong>{query.data.summary.withoutReference}</strong>
                <span>Sem referência suficiente</span>
              </div>
              <div>
                <strong>US$ {(query.data.summary.totalCostMicros / 1000000).toFixed(4)}</strong>
                <span>Custo acumulado · resultados salvos</span>
              </div>
            </div>
            <div className={styles.filters} aria-label="Filtrar resultados">
              {(
                ['all', 'reused', 'variation', 'different', 'inconclusive', 'pending'] as const
              ).map((status) => (
                <button
                  key={status}
                  type="button"
                  aria-pressed={filter === status}
                  onClick={() => setFilter(status)}
                >
                  {status === 'all' ? 'Todos' : status === 'pending' ? 'Pendentes' : labels[status]}{' '}
                  <span>
                    {status === 'all'
                      ? query.data!.ads.length
                      : status === 'pending'
                        ? query.data!.ads.filter((a) => !a.saved).length
                        : query.data!.summary.classifications[status]}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
        <div className={styles.layout}>
          <aside aria-label="Anúncios não confirmados">
            <h2>{query.data?.ads.length ?? '—'} anúncios investigados</h2>
            <p>Coleta {query.data ? new Date(query.data.at).toLocaleString('pt-BR') : '—'}</p>
            <div className={styles.list}>
              {query.data?.ads
                .filter(
                  (ad) =>
                    filter === 'all' ||
                    (filter === 'pending' ? !ad.saved : ad.saved?.classification === filter),
                )
                .map((ad) => (
                  <button
                    key={ad.id}
                    type="button"
                    aria-pressed={selected === ad.id}
                    disabled={busy}
                    onClick={() => void compare(ad)}
                  >
                    <strong>{ad.pageName}</strong>
                    <span>ID {ad.id}</span>
                    {ad.saved && (
                      <small className={styles.saved}>
                        {labels[ad.saved.classification]} · salva
                      </small>
                    )}
                    <small>
                      {ad.previous
                        ? `${ad.recoveredReference ? 'Referência recuperada' : 'Referência'} ${ad.previous.id}`
                        : 'Sem referência histórica suficiente'}
                    </small>
                  </button>
                ))}
            </div>
          </aside>
          <section aria-label="Resultado da comparação" aria-busy={busy}>
            {!selected && (
              <div className={styles.empty}>
                <h2>Escolha um anúncio</h2>
                <p>Veja as imagens lado a lado e o motivo da classificação sugerida.</p>
              </div>
            )}
            {busy && (
              <output className={styles.empty}>
                <h2>Preparando a comparação…</h2>
                <p>Recuperando quadros e consultando a análise salva antes de usar a IA.</p>
              </output>
            )}
            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}
            {comparison && (
              <>
                <div className={styles.result}>
                  <span className={styles.badge}>
                    {comparison.cached ? 'Salva · sem nova chamada' : 'Nova análise salva'}
                  </span>
                  <h2>{labels[comparison.result.classification]}</h2>
                  <p>{comparison.result.reason}</p>
                  <small>
                    {new Date(comparison.at).toLocaleString('pt-BR')} ·{' '}
                    {comparison.costReserved ? 'Reserva de custo' : 'Custo da análise original'} US${' '}
                    {(comparison.costMicros / 1000000).toFixed(4)}
                  </small>
                </div>
                <div className={styles.pair}>
                  {comparison.compared.map((ad, i) => (
                    <article key={ad.id}>
                      <h3>{i === 0 ? 'Anúncio investigado' : 'Referência do histórico'}</h3>
                      <a
                        href={`https://www.facebook.com/ads/library/?id=${ad.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        ID {ad.id} ↗
                      </a>
                      <div className={styles.frames}>
                        {ad.frames.map((frame) => (
                          <figure key={frame.second}>
                            <img
                              src={frame.image}
                              alt={`Quadro do anúncio ${ad.id} em ${frame.second} segundos`}
                            />
                            <figcaption>{frame.second.toFixed(2)}s</figcaption>
                          </figure>
                        ))}
                      </div>
                      <details>
                        <summary>Texto coletado</summary>
                        <p>{ad.text}</p>
                      </details>
                    </article>
                  ))}
                </div>
                <div className={styles.evidence}>
                  {(['similarities', 'differences', 'limitations'] as const).map((key) => (
                    <section key={key}>
                      <h3>
                        {
                          {
                            similarities: 'Semelhanças',
                            differences: 'Diferenças',
                            limitations: 'Limites da análise',
                          }[key]
                        }
                      </h3>
                      <ul>
                        {comparison.result[key].map((text) => (
                          <li key={text}>{text}</li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              </>
            )}
          </section>
        </div>
      </main>
    </HubShell>
  );
}
