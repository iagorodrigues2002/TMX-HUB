import { CalendarClock, Layers3 } from 'lucide-react';
import s from './spy.module.css';
import type { LibraryViewJob } from './use-spy-library';
export function SpyCardReading({
  job,
  compact = false,
}: { job?: LibraryViewJob; compact?: boolean }) {
  const last = job?.snapshots.filter((v) => v.currentScope).at(-1) ?? job?.snapshots.at(-1);
  return (
    <div
      className={`${s.cardReading} ${compact ? s.compactReading : ''}`}
      data-empty={!last || last.count === 0}
    >
      <div className={s.readingMetric}>
        <span className={s.readingIcon}>
          <Layers3 size={18} aria-hidden="true" />
        </span>
        <div>
          <span className={s.readingLabel}>Anúncios ativos</span>
          <strong>{last ? last.count.toLocaleString('pt-BR') : '—'}</strong>
        </div>
        <span className={s.readingPill}>
          {!last ? 'Pendente' : last.count === 0 ? 'Nenhum encontrado' : 'Encontrados'}
        </span>
      </div>
      {last ? (
        <time dateTime={last.at}>
          <CalendarClock size={13} aria-hidden="true" />
          <span>Última leitura</span>
          {new Date(last.at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
        </time>
      ) : (
        <small>Sem consulta válida</small>
      )}
      {last && job?.currentReadings === 0 && (
        <small>Histórico anterior · ScrapeCreators ainda não consultado</small>
      )}
      {job?.error && <small>Consulta falhou · último resultado preservado</small>}
    </div>
  );
}
