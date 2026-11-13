'use client';
import { Button } from '@/components/ui/button';
import { KeyRound, Radio } from 'lucide-react';
import Link from 'next/link';
import type { SpyOffer } from './spy-model';
import s from './spy.module.css';
import {
  type LibraryViewJob,
  type SpyLibrary,
  libraryErrorText,
  libraryStatusText,
} from './use-spy-library';
const time = (value: string | null) => (value ? new Date(value).toLocaleString('pt-BR') : '—');
export function LibrarySettings({ library }: { library: SpyLibrary }) {
  const connection = library.status.data;
  const connected = connection?.connected && connection.provider === 'scrapecreators';
  const plan = connection?.spendingPlan;
  return (
    <section className={s.panel}>
      <KeyRound size={23} />
      <h2>Library · ScrapeCreators</h2>
      <span className={s.tag}>
        {connection?.paidRequestsEnabled
          ? 'Consultas autorizadas'
          : plan
            ? 'Preparado · gastos bloqueados'
            : 'Preparar acompanhamento'}
      </span>
      <p>
        Leitura inicial e sete atualizações diárias de todas as fontes das 29 ofertas. O ciclo
        começa na primeira leitura válida, após autorização de gastos.
      </p>
      <Button
        disabled={library.action.isPending || !!plan}
        onClick={() => library.action.mutate({ action: 'prepare_scrape' })}
      >
        {connection?.paidRequestsEnabled
          ? 'Acompanhamento configurado'
          : plan
            ? 'Preparado · sem consumir créditos'
            : 'Preparar as 29 ofertas sem gastar'}
      </Button>
      <p>
        {connection?.monitoringCoverage?.verified ?? 0} /{' '}
        {connection?.monitoringCoverage?.total ?? 0} ofertas com coleta completa nas últimas 24
        horas pelo provedor atual. O histórico anterior é preservado.
      </p>
      {plan && (
        <div className={s.notice}>
          {connection?.unlimitedRequests ? (
            <p>
              <strong>Sem teto interno de consultas.</strong> Uso do saldo disponível no
              ScrapeCreators.
            </p>
          ) : (
            <p>
              Limite do ciclo: <strong>{plan.creditLimit.toLocaleString('pt-BR')} créditos</strong>{' '}
              · aproximadamente US$ {((plan.creditLimit * 47) / 25000).toFixed(2)} em consumo.
            </p>
          )}
          <p>
            {connection?.unlimitedRequests
              ? `Consultas registradas: ${plan.reserved.toLocaleString('pt-BR')} · último saldo: ${connection.creditsRemaining?.toLocaleString('pt-BR') ?? '—'} créditos.`
              : `Limite diário: ${plan.dailyLimit.toLocaleString('pt-BR')} · consultas reservadas: ${plan.reserved} · saldo do limite: ${plan.creditLimit - plan.reserved}.`}
          </p>
          <p>
            {connected ? 'Credencial protegida já salva.' : 'Credencial ainda pendente.'}{' '}
            {connection?.paidRequestsEnabled
              ? 'Consultas pagas autorizadas.'
              : 'Consultas pagas bloqueadas.'}{' '}
            Nenhuma recarga automática.
          </p>
        </div>
      )}
      {(connection?.testError || connection?.connectionError) && (
        <p role="alert" className={s.error}>
          {libraryErrorText[connection.testError || connection.connectionError] ??
            'Consulta não concluída.'}
        </p>
      )}
      {library.error && (
        <p role="alert" className={s.error}>
          {library.error}
        </p>
      )}
      <p>O acompanhamento roda automaticamente, preservando o histórico entre consultas.</p>
      {connection && (
        <p>
          {connection.paidRequestsEnabled ? 'Consultas autorizadas' : 'Consultas bloqueadas'} ·
          último saldo conhecido: {connection.creditsRemaining ?? '—'} créditos.
        </p>
      )}
      {connection?.testedAt && <small>Último teste: {time(connection.testedAt)}</small>}
    </section>
  );
}
export function LibraryMonitoring({
  offers,
  library,
  onOpen,
}: { offers: SpyOffer[]; library: SpyLibrary; onOpen: (id: string) => void }) {
  const state = library.status.data;
  const tracked = offers.filter((o) => state?.jobs[o.id]?.optedIn);
  return (
    <>
      <div className={s.sectionHeading}>
        <div>
          <h2>Radar de anúncios e criativos</h2>
          <p>
            Compare novos IDs com criativos realmente novos, reutilizações e variações. Os números
            representam a última coleta completa de cada oferta.
          </p>
        </div>
        <span className={s.tag}>
          <Radio size={12} />
          {state?.workerRunning ? 'Monitor ativo' : 'Monitor indisponível'}
        </span>
      </div>
      {!state?.connected && (
        <div className={s.notice}>Ative o coletor autônomo em Configurações.</div>
      )}
      {state?.provider === 'scrapecreators' && !state.paidRequestsEnabled && (
        <div className={s.notice}>
          ScrapeCreators preparado, com gastos bloqueados. As contagens abaixo são do histórico
          anterior; ainda não foram verificadas pela API. O ciclo de sete dias ainda não começou.
        </div>
      )}
      <p className={s.footnote}>
        {state?.monitoringCoverage?.verified ?? 0} /{' '}
        {state?.monitoringCoverage?.total ?? offers.length} ofertas verificadas nas últimas 24h.
        Ofertas sem link da Library usam buscas pelos domínios cadastrados.
      </p>
      {library.status.isError && <p role="alert">Não foi possível consultar o monitor.</p>}
      <div className={s.monitorMetrics}>
        {(
          [
            ['Novos IDs', 'total'],
            ['Criativos novos', 'new'],
            ['Reutilizados', 'duplicate'],
            ['Variações', 'variation'],
            ['Não confirmados', 'unverified'],
          ] as const
        ).map(([label, key]) => (
          <div key={key}>
            <small>{label}</small>
            <strong>
              {tracked
                .reduce(
                  (sum, offer) => sum + (state?.jobs[offer.id]?.creativeSummary?.[key] ?? 0),
                  0,
                )
                .toLocaleString('pt-BR')}
            </strong>
          </div>
        ))}
      </div>
      <p className={s.footnote}>
        Novo ID não significa novo criativo. “Criativo novo” exige mídia e histórico completos;
        casos inconclusivos ficam separados. Clique em uma contagem para abrir a lista.
      </p>
      <div className={`${s.tableWrap} ${s.monitorTable}`}>
        <table>
          <caption className="sr-only">Acompanhamento real das ofertas</caption>
          <thead>
            <tr>
              <th>Oferta / fontes</th>
              <th>Situação</th>
              <th>Leituras válidas</th>
              <th>Anúncios coletados</th>
              <th>Novos IDs</th>
              <th>Criativos novos</th>
              <th>Reutilizados</th>
              <th>Variações</th>
              <th>Não confirmados</th>
              <th>Última leitura válida</th>
              <th>Próxima consulta</th>
            </tr>
          </thead>
          <tbody>
            {tracked.map((o) => {
              const j = state?.jobs[o.id];
              const last = j?.snapshots.filter((v) => v.currentScope).at(-1) ?? j?.snapshots.at(-1);
              return (
                <tr key={o.id}>
                  <th>
                    <button type="button" onClick={() => onOpen(o.id)}>
                      {o.name}
                    </button>
                    <small className={s.muted}> · {j?.sources.length ?? 0} fontes</small>
                    {last && <Link className={s.collectionLink} href={`/spy/analise-visual?${new URLSearchParams({ id: o.id, at: last.at })}`}>Análise visual com IA</Link>}
                  </th>
                  <td>
                    {j ? libraryStatusText[j.status] : 'Registrando fontes…'}
                    {last && j?.currentReadings === 0 && (
                      <p className={s.muted}>
                        Histórico anterior · ainda não verificado neste ciclo
                      </p>
                    )}
                    {j?.error && <p className={s.muted}>{libraryErrorText[j.error] ?? j.error}</p>}
                    {j?.progress && (
                      <p className={s.muted}>
                        {j.progress.count} IDs parciais · {j.progress.pages} páginas · coleta
                        incompleta
                      </p>
                    )}
                  </td>
                  <td>{j?.currentReadings ?? 0} / 8</td>
                  <td>{last?.count ?? '—'}</td>
                  <td>
                    {last && !last.baseline ? (
                      <Link
                        className={s.collectionLink}
                        href={`/spy/anuncios?${new URLSearchParams({ id: o.id, at: last.at, creative: 'all-new' })}`}
                      >
                        {last.added} novos · ver links
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                  {(['new', 'duplicate', 'variation', 'unverified'] as const).map((key) => (
                    <td key={key}>
                      {last && !last.baseline && j?.creativeSummary ? (
                        <Link
                          className={s.collectionLink}
                          href={`/spy/anuncios?${new URLSearchParams({ id: o.id, at: last.at, creative: key })}`}
                        >
                          {j.creativeSummary[key]}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                  ))}
                  <td>{time(last?.at ?? null)}</td>
                  <td>
                    {state?.provider === 'scrapecreators' && !state.paidRequestsEnabled
                      ? 'Após autorizar gastos'
                      : state?.connected
                        ? time(j?.nextAt ?? null)
                        : 'Após conectar'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!tracked.length && (
        <div className={s.empty}>
          <Radio size={25} />
          <h3>Nenhuma oferta selecionada para acompanhar</h3>
          <p>
            Na aba Ofertas, clique em Acompanhar no card desejado. O ciclo inclui todas as Libraries
            cadastradas e começa na primeira leitura válida.
          </p>
        </div>
      )}
    </>
  );
}
export function LibraryJobActions({
  job,
  library,
  id,
}: { job: LibraryViewJob | undefined; library: SpyLibrary; id: string }) {
  const finished = job && ['complete', 'incomplete'].includes(job.status);
  return (
    <>
      <div className={s.actions}>
        <span className={s.tag}>
          {job?.optedIn ? libraryStatusText[job.status] : 'Sem acompanhamento'}
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={
            !library.status.data?.connected ||
            (library.status.data?.provider === 'scrapecreators' &&
              !library.status.data.paidRequestsEnabled) ||
            library.action.isPending ||
            !job?.enabled ||
            !job.optedIn ||
            job.status === 'collecting' ||
            !!finished ||
            job?.status === 'source_missing'
          }
          onClick={() => library.action.mutate({ action: 'refresh', id })}
        >
          Consultar agora
        </Button>
        {job && !finished && (
          <Button
            size="sm"
            variant="ghost"
            disabled={library.action.isPending || !job.sources.length}
            onClick={() => library.action.mutate({ action: job.optedIn ? 'pause' : 'resume', id })}
          >
            {job.optedIn
              ? 'Deixar de acompanhar'
              : `Acompanhar ${job.sources.length} ${job.sources.length === 1 ? 'Library' : 'Libraries'} por 7 dias`}
          </Button>
        )}
      </div>
      {job?.error && (
        <p className={s.error}>{libraryErrorText[job.error] ?? 'Consulta não concluída.'}</p>
      )}
      {job?.startedAt && (
        <p className={s.muted}>
          Início: {time(job.startedAt)} · próxima consulta: {time(job.nextAt)}
        </p>
      )}
      {library.error && <p className={s.error}>{library.error}</p>}
    </>
  );
}
