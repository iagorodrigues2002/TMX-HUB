'use client';
import styles from '@/app/spy/analise-visual/visual.module.css';
import { request } from '@/lib/api-client/request';
import {
  type StructureAd,
  type StructureRecord,
  structureGroups,
  structureLabels,
} from '@/lib/spy-structure';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { SpyTranscript } from './spy-transcript';

export function SpyStructurePanel({
  endpoint,
  companyId,
  userId,
  selected,
  onSelect,
  view,
}: {
  endpoint: string;
  companyId: string;
  userId: string;
  selected: string;
  onSelect: (id: string) => void;
  view: 'rankings' | 'detail';
}) {
  const query = useQuery({
    queryKey: ['spy-structure', companyId, userId, endpoint],
    queryFn: () =>
      request<{ at: string; ads: StructureAd[] }>(
        `${endpoint}${endpoint.includes('?') ? '&' : '?'}view=structure`,
      ),
    staleTime: 30000,
    retry: false,
  });
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<{ frames: { second: number; image: string }[] }>();
  const stop = useRef(false);
  useEffect(
    () => () => {
      stop.current = true;
    },
    [],
  );
  const ads = query.data?.ads ?? [];
  const analyzed = ads.filter((a) => a.saved);
  const current = ads.find((a) => a.id === selected);
  useEffect(() => {
    setDetail(undefined);
    setError('');
    if (view !== 'detail' || !current?.saved) return;
    let active = true;
    request<StructureRecord & { frames: { second: number; image: string }[] }>(endpoint, {
      method: 'POST',
      body: { action: 'structure', adId: current.id, cachedOnly: true },
    })
      .then((value) => {
        if (active) setDetail(value);
      })
      .catch((e) => {
        if (active)
          setError(e instanceof Error ? e.message : 'Não foi possível recuperar os quadros.');
      });
    return () => {
      active = false;
    };
  }, [view, current?.id, current?.saved, endpoint]);
  async function analyze(items: StructureAd[]) {
    setBusy(true);
    setError('');
    stop.current = false;
    let done = 0;
    try {
      for (const ad of items) {
        if (stop.current) break;
        setProgress(`${done + 1} de ${items.length} · ${ad.name}`);
        const value = await request<
          StructureRecord & { frames: { second: number; image: string }[] }
        >(endpoint, {
          method: 'POST',
          body: { action: 'structure', adId: ad.id, cachedOnly: !!ad.saved },
        });
        if (view === 'detail') onSelect(ad.id);
        setDetail(value);
        done++;
        await query.refetch();
      }
      setProgress(`${done} análises recuperadas ou salvas.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Análise não concluída.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      aria-label={
        view === 'rankings'
          ? 'Padrões da comparação visual'
          : 'Hook, final e áudio do anúncio selecionado'
      }
      className={styles.structure}
    >
      {view === 'rankings' && (
        <>
          <div className={styles.result}>
            <span className={styles.eyebrow}>PADRÕES DA OFERTA</span>
            <h2>O que mais aparece nos anúncios</h2>
            <p>
              Hooks nos primeiros 3–5s, encerramentos nos últimos 5s e áudio. Contagem por ID único,
              na coleta selecionada.
            </p>
            <div className={styles.summary}>
              <div>
                <strong>
                  {analyzed.length}/{ads.length}
                </strong>
                <span>Hooks, finais e áudio analisados</span>
                {!!analyzed.filter((a) => a.historicalAt).length && (
                  <small>
                    {analyzed.filter((a) => a.historicalAt).length} recuperados do histórico
                  </small>
                )}
              </div>
              <div>
                <strong>{ads.filter((a) => !a.available).length}</strong>
                <span>Sem mídia única disponível</span>
              </div>
              <div>
                <strong>{analyzed.filter((a) => a.saved?.audio?.kind === 'music').length}</strong>
                <span>Música sem locução</span>
              </div>
            </div>
            <div className={styles.filters}>
              <button
                type="button"
                disabled={busy || !ads.some((a) => a.available && !a.saved)}
                onClick={() => void analyze(ads.filter((a) => a.available && !a.saved))}
              >
                Analisar pendentes disponíveis
              </button>
              {busy && (
                <button
                  type="button"
                  onClick={() => {
                    stop.current = true;
                    setProgress('Parando após a análise atual…');
                  }}
                >
                  Parar após este anúncio
                </button>
              )}
            </div>
            <small>
              Resultados salvos por empresa. Só a primeira análise de cada conteúdo usa a IA e o
              limite diário da empresa. A frequência não comprova desempenho.
            </small>
            {progress && <output>{progress}</output>}
            {(error || query.error) && <p role="alert">{error || query.error?.message}</p>}
            {query.isPending && <output>Carregando resumo salvo…</output>}
          </div>
          <div className={styles.patterns}>
            {(['hookType', 'endingType', 'trophy', 'musicStyle', 'audio'] as const).map((field) => (
              <article key={field}>
                <h3>
                  {
                    {
                      hookType: 'Hooks mais usados',
                      endingType: 'Finais mais usados',
                      trophy: 'Troféus no encerramento',
                      musicStyle: 'Estilos de música',
                      audio: 'Trilhas idênticas',
                    }[field]
                  }
                </h3>
                {field === 'musicStyle' && (
                  <small>Estilos semelhantes; não identifica a mesma canção.</small>
                )}
                {field === 'audio' && (
                  <small>
                    Áudio completo idêntico, sem locução. Reedições podem formar outro grupo. Nome
                    da música não identificado.
                  </small>
                )}
                {structureGroups(ads, field)
                  .slice(0, 8)
                  .map((group, i) => (
                    <div className={styles.pattern} key={group.key}>
                      <div>
                        <strong>
                          {field === 'audio'
                            ? `Trilha ${i + 1}`
                            : (structureLabels[group.key] ?? group.key)}
                        </strong>
                        <span>
                          {group.ids.length} {group.ids.length === 1 ? 'anúncio' : 'anúncios'}
                        </span>
                      </div>
                      <meter
                        min={0}
                        max={Math.max(1, analyzed.length)}
                        value={group.ids.length}
                        aria-label={`${group.ids.length} de ${analyzed.length} anúncios analisados`}
                      />
                      <details>
                        <summary>Ver anúncios</summary>
                        {group.ids.map((id) => (
                          <button
                            type="button"
                            disabled={busy}
                            key={id}
                            onClick={() => {
                              onSelect(id);
                            }}
                          >
                            {ads.find((a) => a.id === id)?.name} · {id}
                          </button>
                        ))}
                      </details>
                    </div>
                  ))}
                {!structureGroups(ads, field).length && (
                  <p className={styles.note}>Sem evidência classificada neste grupo.</p>
                )}
              </article>
            ))}
          </div>
        </>
      )}
      {view === 'detail' && selected && (
        <section className={styles.result} aria-busy={busy}>
          {current?.historicalAt && (
            <p className={styles.note}>
              Análise histórica · coleta de {new Date(current.historicalAt).toLocaleString('pt-BR')}
              . Quadros e áudio da coleta original; nenhuma nova cobrança.
            </p>
          )}
          {(error || query.error) && <p role="alert">{error || query.error?.message}</p>}
          {!current ? (
            <>
              <h2>Explore os padrões</h2>
              <p>Selecione um anúncio para ver o hook, o final e o áudio.</p>
            </>
          ) : (
            <>
              <h2>{current.name}</h2>
              <a
                href={`https://www.facebook.com/ads/library/?id=${current.id}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Anúncio {current.id} ↗
              </a>
              <div className={styles.filters}>
                <button
                  type="button"
                  disabled={busy || !current.available}
                  onClick={() => void analyze([current])}
                >
                  {current.saved ? 'Ver quadros salvos' : 'Analisar este anúncio'}
                </button>
              </div>
              {current.saved && (
                <>
                  <h3>Hook · primeiros 3–5s</h3>
                  <p>{current.saved.result.hook}</p>
                  <h3>Encerramento · últimos 5s</h3>
                  <p>{current.saved.result.ending}</p>
                  {!['none', 'uncertain'].includes(current.saved.result.trophy) && (
                    <p>
                      <strong>{structureLabels[current.saved.result.trophy]}</strong> ·{' '}
                      {current.saved.result.trophyDescription}
                    </p>
                  )}
                  {detail && (
                    <div className={styles.frames}>
                      {detail.frames.map((f) => (
                        <figure key={f.second}>
                          <img src={f.image} alt={`Quadro em ${f.second}s`} />
                          <figcaption>{f.second.toFixed(2)}s</figcaption>
                        </figure>
                      ))}
                    </div>
                  )}
                  {current.saved.audio && (
                    <>
                      <h3>Som na abertura</h3>
                      <p>{current.saved.audio.hook}</p>
                      <h3>Som no final</h3>
                      <p>{current.saved.audio.ending}</p>
                    </>
                  )}
                  <details>
                    <summary>Limites da análise</summary>
                    <ul>
                      {current.saved.result.limitations.map((l) => (
                        <li key={l}>{l}</li>
                      ))}
                    </ul>
                  </details>
                </>
              )}
              <SpyTranscript
                key={`${companyId}:${current.id}`}
                endpoint={
                  current.historicalAt
                    ? `${endpoint.split('?')[0]}?${new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(endpoint.split('?')[1])), at: current.historicalAt })}`
                    : endpoint
                }
                companyId={companyId}
                userId={userId}
                adId={current.id}
                hasAudio={!!current.video}
              />
            </>
          )}
        </section>
      )}
    </section>
  );
}
