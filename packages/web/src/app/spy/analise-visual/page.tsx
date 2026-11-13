'use client';
import { HubShell } from '@/components/hub/hub-shell';
import { SpyScalingPanel } from '@/components/spy/spy-scaling-panel';
import { SpySelect } from '@/components/spy/spy-select';
import { SpyStructurePanel } from '@/components/spy/spy-structure-panel';
import { SpyTranscript } from '@/components/spy/spy-transcript';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { request } from '@/lib/api-client/request';
import { useAuth } from '@/lib/auth-context';
import { safeAdThumbnail } from '@/lib/spy-ad-preview';
import type { SpyScaling } from '@/lib/spy-scaling';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import styles from './visual.module.css';
type Ad = {
  id: string;
  pageName: string;
  title?: string;
  historicalAt?: string;
  previous?: { id: string };
  recoveredReference?: boolean;
  recoveryNote?: string;
  saved?: { classification: keyof typeof labels; reason: string; at: string };
  activity: { status: 'active' | 'inactive' | 'unknown'; checkedAt?: string };
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
  compared: {
    id: string;
    text: string;
    hasAudio: boolean;
    frames: { second: number; image: string }[];
  }[];
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
  const [reading, setReading] = useState<string>();
  const [activeLimit, setActiveLimit] = useState(24);
  const selection = new URLSearchParams();
  if (params.get('id')) selection.set('id', params.get('id')!);
  const at = reading ?? params.get('at');
  if (at) selection.set('at', at);
  const endpoint = `/api/spy-visual${selection.size ? `?${selection}` : ''}`;
  const query = useQuery({
    queryKey: ['spy-visual-preview', user?.id, endpoint],
    queryFn: () =>
      request<{
        name: string;
        companyId: string;
        offerId: string;
        scaling: SpyScaling | null;
        at: string;
        ads: Ad[];
        readings: { at: string; ads: number; analyzed: number }[];
        activeAt?: string;
        activeAds: (Ad & { thumbnailUrl?: string; thumbnailKey?: string })[];
        summary: {
          analyzed: number;
          historical: number;
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
  const [section, setSection] = useState('visual');
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [comparison, setComparison] = useState<Comparison>();
  const historicalAt = query.data?.ads.find((a) => a.id === selected)?.historicalAt;
  function readingEndpoint(at?: string) {
    if (!at) return endpoint;
    const params = new URLSearchParams(selection);
    params.set('at', at);
    return `/api/spy-visual?${params}`;
  }
  const resultRef = useRef<HTMLElement>(null);
  const comparisonRequest = useRef(0);
  const previousEndpoint = useRef(endpoint);
  useEffect(() => {
    if (previousEndpoint.current === endpoint) return;
    previousEndpoint.current = endpoint;
    comparisonRequest.current++;
    setSelected('');
    setComparison(undefined);
    setBusy(false);
    setError('');
    setActiveLimit(24);
  }, [endpoint]);
  async function compare(ad: Ad, generate = false) {
    const ticket = ++comparisonRequest.current;
    setSelected(ad.id);
    setBusy(true);
    setError('');
    setComparison(undefined);
    if (!ad.previous && !ad.historicalAt) {
      setError(ad.recoveryNote ?? 'Sem referência suficiente no histórico. Nenhuma chamada à IA.');
      setBusy(false);
      return;
    }
    if (!ad.saved && !ad.historicalAt && !generate) {
      setBusy(false);
      return;
    }
    try {
      const value = await request<Comparison>(readingEndpoint(ad.historicalAt), {
        method: 'POST',
        body: { adId: ad.id, cachedOnly: !!ad.saved || !!ad.historicalAt },
      });
      if (ticket !== comparisonRequest.current) return;
      setComparison(value);
      void query.refetch();
    } catch (e) {
      if (ticket === comparisonRequest.current)
        setError(e instanceof Error ? e.message : 'Não foi possível comparar.');
    } finally {
      if (ticket === comparisonRequest.current) setBusy(false);
    }
  }
  function selectFromRanking(id: string) {
    const ad = query.data?.ads.find((a) => a.id === id);
    if (!ad) return;
    setFilter('all');
    void compare(ad);
    resultRef.current?.scrollIntoView({
      block: 'start',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
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
        <Link href="/spy?view=analysis">← Ofertas em análise com IA</Link>
        <header>
          <div>
            <span className={styles.eyebrow}>SPY · ANÁLISE VISUAL</span>
            <h1>Análise com IA</h1>
            <p>{query.data?.name ?? 'Anúncios não confirmados'}</p>
          </div>
          <span className={styles.badge}>Análises salvas por empresa</span>
        </header>
        <Tabs value={section} onValueChange={setSection}>
          <TabsList aria-label="Análises desta oferta">
            <TabsTrigger value="visual">Comparação visual</TabsTrigger>
            <TabsTrigger value="active">
              Anúncios ativos · {query.data?.activeAds.length ?? '—'}
            </TabsTrigger>
            <TabsTrigger value="scaling">Escalando</TabsTrigger>
          </TabsList>
        </Tabs>
        {section === 'visual' && query.data && (
          <div className={styles.history}>
            <div>
              <strong>Histórico de coletas</strong>
              <p>
                As análises ficam salvas na coleta original. Troque a data para consultar o
                histórico.
              </p>
            </div>
            <SpySelect
              label="Coleta da comparação visual"
              value={query.data.at}
              onChange={setReading}
              options={[...query.data.readings].reverse().map((s) => ({
                value: s.at,
                label: `${new Date(s.at).toLocaleString('pt-BR')} · ${s.ads} ads · ${s.analyzed} com análise no histórico`,
              }))}
            />
          </div>
        )}
        {section === 'active' && query.data && (
          <section aria-label="Anúncios ativos na Library">
            <h2>{query.data.activeAds.length} anúncios ativos encontrados</h2>
            <p className={styles.note}>
              Status informado pela Library na última coleta concluída:{' '}
              {query.data.activeAt
                ? new Date(query.data.activeAt).toLocaleString('pt-BR')
                : 'sem coleta'}
              . O status pode mudar depois desse horário.
            </p>
            <div className={styles.activeGrid}>
              {query.data.activeAds.slice(0, activeLimit).map((ad) => {
                const image = ad.thumbnailKey
                  ? `/api/spy-library?view=image&key=${ad.thumbnailKey}`
                  : safeAdThumbnail(ad.thumbnailUrl);
                return (
                  <a
                    className={styles.activeCard}
                    key={ad.id}
                    href={`https://www.facebook.com/ads/library/?id=${ad.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {image && (
                      <img
                        src={image}
                        alt={`Anúncio de ${ad.pageName}`}
                        loading="lazy"
                        decoding="async"
                        referrerPolicy="no-referrer"
                      />
                    )}
                    <span className={styles.saved}>● Ativo na última consulta</span>
                    <strong>{ad.pageName}</strong>
                    <span>{ad.title ?? `Anúncio ${ad.id}`}</span>
                    <small>ID {ad.id} · Abrir na Library ↗</small>
                  </a>
                );
              })}
            </div>
            {query.data.activeAds.length > activeLimit && (
              <button type="button" onClick={() => setActiveLimit((n) => n + 24)}>
                Mostrar mais anúncios
              </button>
            )}
          </section>
        )}
        {section === 'visual' && query.data && user && (
          <SpyStructurePanel
            key={`${user.id}:${query.data.companyId}:${endpoint}`}
            endpoint={endpoint}
            companyId={query.data.companyId}
            userId={user.id}
            view="rankings"
            selected={selected}
            onSelect={selectFromRanking}
          />
        )}
        {section === 'scaling' && query.data && (
          <SpyScalingPanel
            key={`${user?.id}:${query.data.companyId}:${query.data.offerId}`}
            companyId={query.data.companyId}
            offer={{ id: query.data.offerId, name: query.data.name, domains: [] }}
            evidence={query.data.scaling}
          />
        )}
        {section === 'visual' && (
          <p className={styles.note}>
            A IA compara quadros do anúncio com uma referência do histórico. A sugestão não altera a
            confirmação técnica. Reabrir a mesma análise usa o resultado salvo.
          </p>
        )}
        {query.isPending && <output>Carregando anúncios…</output>}
        {query.error && <p role="alert">{query.error.message}</p>}
        {section === 'visual' && query.data?.summary && (
          <>
            <div className={styles.summary}>
              <div>
                <strong>
                  {query.data.summary.analyzed}/{query.data.ads.length}
                </strong>
                <span>Comparações desta coleta</span>
                {!!query.data.summary.historical && (
                  <small>+{query.data.summary.historical} com comparação salva no histórico</small>
                )}
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
        {section === 'visual' && (
          <div className={styles.layout}>
            <aside aria-label="Anúncios da comparação visual">
              <h2>{query.data?.ads.length ?? '—'} anúncios da coleta</h2>
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
                      <small>
                        {ad.activity.status === 'active'
                          ? 'Ativo na última consulta'
                          : ad.activity.status === 'inactive'
                            ? 'Inativo na Library'
                            : 'Status atual não confirmado'}
                      </small>
                      {ad.saved && (
                        <small className={styles.saved}>
                          {labels[ad.saved.classification]} · salva
                        </small>
                      )}
                      {ad.historicalAt && (
                        <small className={styles.saved}>
                          Comparação salva · abrir coleta original
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
            <section ref={resultRef} aria-label="Resultado da comparação" aria-busy={busy}>
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
              {selected &&
                !busy &&
                !comparison &&
                query.data?.ads.find((a) => a.id === selected)?.previous && (
                  <div className={styles.result}>
                    <p>Comparação lado a lado ainda não gerada para este anúncio.</p>
                    <button
                      type="button"
                      onClick={() =>
                        void compare(query.data!.ads.find((a) => a.id === selected)!, true)
                      }
                    >
                      Gerar comparação com IA
                    </button>
                  </div>
                )}
              {selected && query.data && user && (
                <SpyStructurePanel
                  endpoint={endpoint}
                  companyId={query.data.companyId}
                  userId={user.id}
                  view="detail"
                  selected={selected}
                  onSelect={selectFromRanking}
                />
              )}
              {comparison && (
                <>
                  <div className={styles.result}>
                    <span className={styles.badge}>
                      {comparison.cached ? 'Salva · sem nova chamada' : 'Nova análise salva'}
                    </span>
                    <h2>{labels[comparison.result.classification]}</h2>
                    {historicalAt && (
                      <p>
                        Análise histórica · coleta de{' '}
                        {new Date(historicalAt).toLocaleString('pt-BR')}
                      </p>
                    )}
                    <p>{comparison.result.reason}</p>
                    <small>
                      {new Date(comparison.at).toLocaleString('pt-BR')} ·{' '}
                      {comparison.costReserved ? 'Reserva de custo' : 'Custo da análise original'}{' '}
                      US$ {(comparison.costMicros / 1000000).toFixed(4)}
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
                        {i === 1 && (
                          <SpyTranscript
                            key={`${user!.id}:${query.data!.companyId}:${endpoint}:${ad.id}`}
                            endpoint={readingEndpoint(historicalAt)}
                            companyId={query.data!.companyId}
                            userId={user!.id}
                            adId={selected}
                            referenceId={i === 1 ? ad.id : undefined}
                            hasAudio={ad.hasAudio}
                          />
                        )}
                        <details>
                          <summary>Texto do anúncio na Library</summary>
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
        )}
      </main>
    </HubShell>
  );
}
