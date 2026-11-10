'use client';
import { Button } from '@/components/ui/button';
import { monitorSources } from '@/lib/spy-monitor-sources';
import { CalendarDays, ExternalLink, Pencil } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { SpyAdsList } from './spy-ads-list';
import { LibraryJobActions } from './spy-library-panels';
import {
  type SpyOffer,
  linkKinds,
  safeSpyUrl,
  spyDays,
  spyPending,
  spySourceType,
  spyStageOptions,
} from './spy-model';
import { SpySelect } from './spy-select';
import s from './spy.module.css';
import { type SpyLibrary, libraryStatusText } from './use-spy-library';
export function SpyDetails({
  offer,
  onChange,
  onEdit,
  library,
}: { offer: SpyOffer; onChange: (o: SpyOffer) => void; onEdit: () => void; library: SpyLibrary }) {
  const [demo, setDemo] = useState(false);
  const params = useSearchParams();
  const fixture =
    process.env.NEXT_PUBLIC_TMX_LOCAL_PREVIEW_KIND === 'synthetic' &&
    params.get('fixture') === 'page-history';
  const pending = spyPending(offer);
  const job = library.status.data?.jobs[offer.id];
  const previousScope = job?.snapshots.at(-1)?.scope;
  const readings =
    job?.snapshots.filter((v) =>
      job.currentReadings ? v.currentScope : v.scope === previousScope,
    ) ?? [];
  const latest = readings.at(-1);
  const maxCount = Math.max(1, ...readings.map((v) => v.count));
  return (
    <div className={s.details}>
      {fixture && (
        <div className={s.notice}>
          Teste simulado · Dia {params.get('day') ?? '0'} · sem créditos, sem alterar os dados
          reais.
        </div>
      )}
      <div className={s.actions}>
        <span className={s.tag}>{offer.niche || 'Sem nicho'}</span>
        <span className={s.tag}>Funil: {offer.funnelType ?? 'Não informado'}</span>
        <span className={s.tag} data-tone={offer.market === 'Escalado' ? 'accent' : undefined}>
          {offer.market}
        </span>
        <Button variant="outline" size="sm" onClick={onEdit}>
          <Pencil size={14} />
          Editar cadastro
        </Button>
      </div>
      <div className={s.detailStats}>
        <div>
          <small>Domínios</small>
          <strong>{offer.domains.length}</strong>
        </div>
        <div>
          <small>Destinos salvos</small>
          <strong>{offer.links.length}</strong>
        </div>
        <div>
          <small>Acompanhamento</small>
          <strong>{job ? libraryStatusText[job.status] : 'Registrando'}</strong>
        </div>
      </div>
      <section className={s.section}>
        <h3>Domínios da oferta</h3>
        <div className={s.domains}>
          {offer.domains.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        {!offer.domains.length && <p>Nenhum domínio cadastrado.</p>}
      </section>
      <section className={s.section}>
        <h3>Links e ativos</h3>
        <div className={s.linkGrid}>
          {Object.entries(linkKinds)
            .filter(([k]) => k !== 'domain')
            .map(([kind, label]) => {
              const links =
                kind === 'library'
                  ? monitorSources(
                      offer.links.filter((l) => l.kind === kind).map((l) => l.url),
                      offer.domains,
                    ).map((url) => ({ url }))
                  : offer.links.filter((l) => l.kind === kind);
              return (
                <div key={kind}>
                  <small>{label}</small>
                  {links.length ? (
                    links.map((l, i) => {
                      const url = safeSpyUrl(l.url);
                      return url ? (
                        <a key={url} href={url} target="_blank" rel="noopener noreferrer">
                          {kind === 'library'
                            ? spySourceType(url)
                            : `${label}${links.length > 1 ? ` ${i + 1}` : ''}`}
                          <ExternalLink size={13} />
                        </a>
                      ) : (
                        <span key={l.url}>Link inválido</span>
                      );
                    })
                  ) : (
                    <span className={s.muted}>Não cadastrado</span>
                  )}
                </div>
              );
            })}
        </div>
      </section>
      <section className={s.section}>
        <div className={s.sectionHeading}>
          <div>
            <h3>
              {latest && job?.currentReadings === 0
                ? 'Histórico anterior da oferta'
                : 'Acompanhamento de 7 dias'}
            </h3>
            <p>
              {demo
                ? 'Exemplo ilustrativo · não são dados da Meta'
                : 'Leituras completas da Library. Falhas não são anúncios zero.'}
            </p>
          </div>
          <CalendarDays size={20} />
        </div>
        <div
          className={s.timeline}
          aria-label={demo ? 'Exemplo de evolução dos anúncios' : 'Histórico real da Library'}
        >
          {spyDays.map((day, i) => (
            <div key={day}>
              <strong>
                {demo
                  ? [24, 29, 29, 35, 42, 44, 48, 53][i]
                  : (readings.find((v) => v.day === i)?.count ?? '—')}
              </strong>
              <div
                className={s.dayBar}
                style={{
                  height: demo
                    ? `${[24, 29, 29, 35, 42, 44, 48, 53][i]! + 12}px`
                    : `${readings.some((v) => v.day === i) ? 6 + ((readings.find((v) => v.day === i)?.count ?? 0) / maxCount) * 78 : 6}px`,
                }}
                data-demo={demo || readings.some((v) => v.day === i)}
              />
              <small>{day}</small>
            </div>
          ))}
        </div>
        {!demo && (
          <div className={s.tableWrap}>
            <table>
              <caption className="sr-only">Leituras diárias e novas páginas encontradas</caption>
              <thead>
                <tr>
                  <th>Leitura</th>
                  <th>Anúncios encontrados</th>
                  <th>Novos anúncios</th>
                  <th>Páginas encontradas</th>
                  <th>Novas páginas</th>
                  <th>Data e hora</th>
                </tr>
              </thead>
              <tbody>
                {spyDays.map((day, i) => {
                  const reading = readings.find((v) => v.day === i);
                  return (
                    <tr key={day}>
                      <th>{day}</th>
                      {reading ? (
                        <>
                          <td>{reading.count}</td>
                          <td>{reading.baseline ? '—' : reading.added}</td>
                          <td>{reading.pagesCount}</td>
                          <td>
                            {reading.baseline
                              ? 'Linha de base'
                              : `${reading.newPages} ${reading.newPages === 1 ? 'nova' : 'novas'}${reading.returningPages ? ` · ${reading.returningPages} reapareceram` : ''}`}
                          </td>
                          <td>{new Date(reading.at).toLocaleString('pt-BR')}</td>
                        </>
                      ) : (
                        <td colSpan={5}>Sem leitura válida</td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className={s.actions}>
          <Button variant="outline" size="sm" onClick={() => setDemo((v) => !v)}>
            {demo ? 'Ocultar exemplo' : 'Ver exemplo de evolução'}
          </Button>
        </div>
        <LibraryJobActions job={job} library={library} id={offer.id} />
        <p className={s.muted}>
          {library.status.data?.provider === 'scrapecreators' &&
          !library.status.data.paidRequestsEnabled
            ? 'Ciclo preparado. As leituras e a comparação de novas páginas começarão após autorização de gastos.'
            : library.status.data?.connected
              ? 'Monitoramento local habilitado. O ciclo começa na primeira leitura válida e continua com o navegador fechado enquanto o Mac estiver ligado.'
              : 'Aguardando credencial autorizada da Library em Configurações.'}
        </p>
        {latest && (
          <div className={s.section}>
            <p>
              {latest.baseline
                ? 'Linha de base'
                : `${latest.added} ${latest.added === 1 ? 'anúncio novo' : 'anúncios novos'} · ${latest.missing} não retornaram`}{' '}
              · {new Date(latest.at).toLocaleString('pt-BR')}
            </p>
            <small>
              Recorte: {latest.countries.includes('ALL') ? 'global' : latest.countries.join(', ')} ·
              fontes cadastradas da oferta.
            </small>
            <SpyAdsList id={offer.id} at={latest.at} />
            <SpyAdsList id={offer.id} at={latest.at} kind="pages" />
          </div>
        )}
      </section>
      <section className={s.section}>
        <h3>Organização e clonagem</h3>
        <div className={s.formGrid}>
          <label htmlFor="spy-details-stage">
            Etapa
            <SpySelect
              id="spy-details-stage"
              label="Etapa"
              value={offer.stage}
              onChange={(stage) => onChange({ ...offer, stage })}
              options={spyStageOptions}
            />
          </label>
          <div>
            <small>Responsável</small>
            <p>{offer.owner || 'Não atribuído'}</p>
          </div>
        </div>
        <p className={s.muted}>
          Esta etapa organiza o trabalho. Não dispara ferramentas de clonagem.
        </p>
      </section>
      {(pending.length > 0 || offer.note) && (
        <section className={s.section}>
          <h3>Notas e pendências</h3>
          {offer.note && <p>{offer.note}</p>}
          {pending.length > 0 && <p>Completar: {pending.join(', ')}.</p>}
        </section>
      )}
    </div>
  );
}
